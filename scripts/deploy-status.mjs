#!/usr/bin/env node
// Estado dos deploys do produto, lido do GitHub (onde a integração da Vercel reporta).
//
// node deploy-status.mjs [--cwd repo]
// → JSON { ok, vercel, production, previews[], buildMigrates, notes[] }
//
// Fontes (validadas no dry-run da F6 — a integração atual da Vercel NÃO usa a API de Deployments):
// - estado: o commit status com contexto "Vercel" do commit (main para produção, head do PR para preview);
//   target_url = página do deploy no painel da Vercel.
// - URL do preview: o comentário do vercel[bot] no PR.
// production = o deploy do ÚLTIMO commit da main (depois de um Instant Rollback, pode não ser o que está no ar).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const api = (cwd, path) => {
  const r = gh(cwd, "api", path);
  return r.ok ? JSON.parse(r.out || "null") : null;
};

/** Status "Vercel" de um commit (ref = branch ou sha). null = sem deploy da Vercel. */
export function vercelStatus(cwd, ref) {
  const combined = api(cwd, `repos/{owner}/{repo}/commits/${ref}/status`);
  const s = (combined?.statuses ?? []).find((x) => /^vercel/i.test(x.context ?? ""));
  return s ? { state: s.state, inspect: s.target_url ?? null, description: s.description ?? null } : null;
}

/** URL do preview no comentário do vercel[bot] no PR. */
export function previewUrl(cwd, pr) {
  const comments = api(cwd, `repos/{owner}/{repo}/issues/${pr}/comments?per_page=50`);
  for (const c of Array.isArray(comments) ? comments : []) {
    if (!/vercel/i.test(c.user?.login ?? "")) continue;
    const m = /https:\/\/[a-z0-9.-]+\.vercel\.app/i.exec(c.body ?? "");
    if (m) return m[0];
  }
  return null;
}

export function deployStatus(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const notes = [];
  const pkgPath = join(cwd, "package.json");
  const build = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.build ?? "" : "";
  const buildMigrates = build.includes("scripts/esteira/migrate.mjs");
  if (!buildMigrates) notes.push("O build ainda não migra o banco: rode /esteira:deploy para instalar a migração no build.");

  const repo = gh(cwd, "repo", "view", "--json", "defaultBranchRef");
  if (!repo.ok) {
    return { ok: true, github: "indisponível (sem remoto ou gh sem login)", vercel: "desconhecido", production: null, previews: [], buildMigrates, notes };
  }
  const main = JSON.parse(repo.out || "{}").defaultBranchRef?.name ?? "main";

  const prodStatus = vercelStatus(cwd, main);
  const production = prodStatus ? { ref: main, ...prodStatus } : null;

  const prsOut = gh(cwd, "pr", "list", "--state", "open", "--json", "number,headRefName,title");
  const prs = prsOut.ok ? JSON.parse(prsOut.out || "[]") : [];
  const previews = prs.map((pr) => {
    const st = vercelStatus(cwd, pr.headRefName);
    return { pr: pr.number, title: pr.title, ref: pr.headRefName, state: st?.state ?? "sem deploy", url: st ? previewUrl(cwd, pr.number) : null, inspect: st?.inspect ?? null };
  });

  const connected = Boolean(prodStatus) || previews.some((p) => p.state !== "sem deploy");
  if (!connected) notes.push("Nenhum deploy da Vercel reportado no GitHub: importe o repo em vercel.com/new (veja docs/deploy.md). Commits anteriores à conexão não têm deploy.");
  return { ok: true, github: "ok", vercel: connected ? "conectada" : "não conectada", production, previews, buildMigrates, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = deployStatus(parseArgs(process.argv.slice(2))); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
