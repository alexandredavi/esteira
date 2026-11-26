#!/usr/bin/env node
// Abre (ou atualiza) o PR de gate de uma etapa: branch → commit → push → PR.
// O merge desse PR é a aprovação humana da etapa.
//
// node gate.mjs --stage discovery --branch docs/discovery --title "docs(discovery): …" \
//   --paths docs/product/discovery.md [--summary "texto"] [--stories 12,13] [--closes 12] [--allow-missing] [--cwd repo] [--body-file corpo.md]
//
// Corpo do PR: --summary + checklist de templates/gates/<stage>.md + marcador <!-- esteira:gate … -->.
//
// Sempre imprime JSON. Sem git ou sem GitHub, não falha: diz o que ficou salvo e o que falta.

import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { git, gh, defaultBranch, parseArgs, list, print } from "./lib.mjs";

export function gateMarker(stage, stories) {
  return `<!-- esteira:gate stage=${stage}${stories.length ? ` stories=${stories.join(",")}` : ""} -->`;
}

export function parseGateMarker(body) {
  const m = /<!-- esteira:gate stage=([\w-]+)(?: stories=([\d,]+))? -->/.exec(body ?? "");
  if (!m) return null;
  return { stage: m[1], stories: m[2] ? m[2].split(",").map(Number) : [] };
}

const TEMPLATES = fileURLToPath(new URL("../templates/gates/", import.meta.url));

// Lê um arquivo ou diretório (recursivo) do working tree: [{ path, content }].
function readTree(cwd, rel) {
  const abs = join(cwd, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [{ path: rel, content: readFileSync(abs) }];
  return readdirSync(abs).flatMap((name) => readTree(cwd, `${rel.replace(/\/$/, "")}/${name}`));
}

// Corpo do PR: resumo (da skill) + checklist da etapa (templates/gates/<etapa>.md) + marcador.
export function buildBody({ cwd = ".", stage, stories = [], summary, bodyFile, closes = [] }) {
  const parts = [];
  // "Closes #n" fecha a issue no merge e liga o PR à story (o status mostra a story em review).
  if (closes.length) parts.push(closes.map((n) => `Closes #${n}`).join("\n"));
  if (bodyFile) parts.push(readFileSync(resolve(cwd, bodyFile), "utf8").trim());
  else {
    parts.push(`## Gate: ${stage}\n\nO merge deste PR é a aprovação humana desta etapa da esteira.`);
    if (summary) parts.push(`### Resumo\n\n${String(summary).trim()}`);
    const checklist = join(TEMPLATES, `${stage}.md`);
    if (existsSync(checklist)) parts.push(readFileSync(checklist, "utf8").trim());
  }
  parts.push(gateMarker(stage, stories));
  return parts.join("\n\n") + "\n";
}

export function openGate(opts) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const { stage, branch, title } = opts;
  const allowMissing = Boolean(opts["allow-missing"]);
  const paths = list(opts.paths).filter((p) => !allowMissing || existsSync(join(resolve(opts.cwd ?? process.cwd()), p)));
  const stories = list(opts.stories).map(Number);
  if (!stage || !branch || !title || paths.length === 0) {
    return { ok: false, error: "Obrigatórios: --stage, --branch, --title, --paths" };
  }
  const missing = paths.filter((p) => !existsSync(join(cwd, p)));
  if (missing.length) return { ok: false, error: `Arquivos não encontrados: ${missing.join(", ")}` };

  const base = { ok: true, stage, branch, paths, opened: false };
  if (!git(cwd, "rev-parse", "--is-inside-work-tree").ok) {
    return { ...base, reason: "Não é um repositório git: artefato salvo localmente, sem commit nem PR." };
  }

  const baseBranch = defaultBranch(cwd);
  const current = git(cwd, "branch", "--show-current").out;
  if (current !== branch) {
    const exists = git(cwd, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).ok;
    if (exists) {
      // Revisão de um gate já aberto, feita a partir de outro branch: guarda a versão nova dos artefatos,
      // tira do caminho (stash), troca de branch e reaplica por cima.
      const snapshot = paths.flatMap((p) => readTree(cwd, p));
      const hadChanges = git(cwd, "status", "--porcelain", "--", ...paths).out !== "";
      if (hadChanges) {
        const st = git(cwd, "stash", "push", "--include-untracked", "-m", `esteira-gate-${stage}`, "--", ...paths);
        if (!st.ok) return { ok: false, error: `Não consegui guardar os artefatos antes de trocar de branch: ${st.err}` };
      }
      const sw = git(cwd, "switch", branch);
      if (!sw.ok) {
        if (hadChanges) git(cwd, "stash", "pop");
        return { ok: false, error: `Não consegui trocar para o branch ${branch}: ${sw.err}` };
      }
      for (const f of snapshot) { mkdirSync(dirname(join(cwd, f.path)), { recursive: true }); writeFileSync(join(cwd, f.path), f.content); }
      if (hadChanges) git(cwd, "stash", "drop");
    } else {
      const hasBase = git(cwd, "rev-parse", "--verify", "--quiet", baseBranch).ok;
      const sw = git(cwd, "switch", "-c", branch, ...(hasBase ? [baseBranch] : []));
      if (!sw.ok) return { ok: false, error: `Não consegui criar o branch ${branch}: ${sw.err}` };
    }
  }

  const add = git(cwd, "add", "--", ...paths);
  if (!add.ok) return { ok: false, error: `git add falhou: ${add.err}` };
  // Só os caminhos da etapa entram no commit, mesmo que haja outras coisas no stage.
  const nothingStaged = git(cwd, "diff", "--cached", "--quiet", "--", ...paths).ok;
  let committed = false;
  if (!nothingStaged) {
    const c = git(cwd, "commit", "-m", title, "--", ...paths);
    if (!c.ok) return { ok: false, error: `git commit falhou: ${c.err}` };
    committed = true;
  }

  const hasOrigin = git(cwd, "remote", "get-url", "origin").ok;
  const ghOk = hasOrigin && gh(cwd, "repo", "view", "--json", "nameWithOwner").ok;
  if (!ghOk) {
    return { ...base, committed, baseBranch, reason: "Sem remoto no GitHub ou gh sem login: commit feito localmente, PR não aberto." };
  }

  const push = git(cwd, "push", "-u", "origin", branch);
  if (!push.ok) return { ok: false, error: `git push falhou: ${push.err}` };

  const existing = gh(cwd, "pr", "list", "--head", branch, "--state", "open", "--json", "number,url");
  const prs = existing.ok ? JSON.parse(existing.out || "[]") : [];
  if (prs.length) return { ...base, opened: true, existed: true, committed, baseBranch, url: prs[0].url };

  const body = buildBody({ cwd, stage, stories, summary: opts.summary, bodyFile: opts["body-file"], closes: list(opts.closes).map(Number) });
  const bodyFile = join(mkdtempSync(join(tmpdir(), "esteira-pr-")), "body.md");
  writeFileSync(bodyFile, body);
  const pr = gh(cwd, "pr", "create", "--base", baseBranch, "--head", branch, "--title", title, "--body-file", bodyFile);
  if (!pr.ok) return { ok: false, error: `gh pr create falhou: ${pr.err}` };
  return { ...base, opened: true, existed: false, committed, baseBranch, url: pr.out.split("\n").pop() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = openGate(parseArgs(process.argv.slice(2)));
  print(result, result.ok ? 0 : 1);
}
