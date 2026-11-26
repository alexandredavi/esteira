#!/usr/bin/env node
// Coleta o estado da esteira num repo de produto e imprime JSON.
// Determinístico e sem dependências: a skill /esteira formata a saída.
//
// Uso: node status.mjs [diretorio-do-produto]
// Fixture de testes: ESTEIRA_GH_FIXTURE=<arquivo.json> substitui as chamadas ao gh.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// path: o que precisa existir no branch padrão; prPrefix: arquivos que um PR de gate dessa etapa toca.
const ARTIFACTS = {
  discovery: { path: "docs/product/discovery.md", prPrefix: "docs/product/discovery.md", gateBranch: "docs/discovery" },
  prd: { path: "docs/product/prd.md", prPrefix: "docs/product/prd.md", gateBranch: "docs/prd" },
  backlog: { path: "docs/specs", prPrefix: "docs/specs/", gateBranch: "docs/backlog" },
  designSystem: { path: "docs/design/README.md", prPrefix: "docs/design/", gateBranch: null },
};

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Branch padrão e a ref que representa o "aprovado".
// Com remoto: busca (git fetch) e compara com origin/<padrão>, porque o merge do gate acontece no GitHub
// e a main local costuma estar desatualizada. Sem remoto: a main local (o merge local é o gate).
export function resolveDefault(cwd) {
  if (run("git", ["rev-parse", "--is-inside-work-tree"], cwd) === null) return { name: null, ref: null, fetched: false };
  const hasOrigin = run("git", ["remote", "get-url", "origin"], cwd) !== null;
  const fetched = hasOrigin && !process.env.ESTEIRA_NO_FETCH && run("git", ["fetch", "--quiet", "origin"], cwd) !== null;
  let name = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)?.replace(/^origin\//, "") ?? null;
  if (!name && hasOrigin) {
    const sym = run("git", ["ls-remote", "--symref", "origin", "HEAD"], cwd);
    name = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(sym ?? "")?.[1] ?? null;
  }
  if (!name) name = ["main", "master"].find((b) => run("git", ["rev-parse", "--verify", "--quiet", b], cwd) !== null) ?? null;
  if (!name) return { name: null, ref: null, fetched };
  const remoteRef = `refs/remotes/origin/${name}`;
  const ref = hasOrigin && run("git", ["rev-parse", "--verify", "--quiet", remoteRef], cwd) !== null ? `origin/${name}` : name;
  return { name, ref, fetched };
}

// Um artefato só conta quando está no branch padrão (entrou por PR mergeado). Sem git, vale o disco.
function artifactState(cwd, ref, path) {
  if (ref) return run("git", ["cat-file", "-e", `${ref}:${path}`], cwd) !== null;
  return existsSync(join(cwd, path));
}

// Branch de gate só local (sem PR): o artefato está nele mas ainda não no padrão.
function pendingLocalBranch(cwd, ref, gateBranch, path) {
  if (!ref || !gateBranch) return null;
  return run("git", ["cat-file", "-e", `refs/heads/${gateBranch}:${path}`], cwd) !== null ? gateBranch : null;
}

function loadGh(cwd) {
  const fixture = process.env.ESTEIRA_GH_FIXTURE;
  if (fixture) return { available: true, ...JSON.parse(readFileSync(fixture, "utf8")) };

  if (run("gh", ["--version"], cwd) === null) return { available: false, reason: "gh não instalado" };
  if (run("gh", ["repo", "view", "--json", "name"], cwd) === null) {
    return { available: false, reason: "repo sem remoto no GitHub ou gh sem login" };
  }
  const issues = JSON.parse(
    run("gh", ["issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,state,labels"], cwd) ?? "[]"
  );
  const prs = JSON.parse(
    run("gh", ["pr", "list", "--state", "open", "--json", "number,title,url,headRefName,body,files"], cwd) ?? "[]"
  );
  return { available: true, issues, prs };
}

const labelNames = (item) => (item.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
const has = (item, label) => labelNames(item).includes(label);

function storyStage(story, prsByIssue) {
  if (story.state === "CLOSED") return "done";
  if (prsByIssue.has(story.number)) return "in-review";
  if (has(story, "ready-for-dev") || has(story, "spec:approved")) return "ready-for-dev";
  if (has(story, "design:approved")) return "design-approved";
  return "backlog";
}

function linkedIssues(pr) {
  const nums = new Set();
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  for (const m of (pr.body ?? "").matchAll(re)) nums.add(Number(m[1]));
  const branch = /^(?:feat|fix|chore)\/(\d+)-/.exec(pr.headRefName ?? "");
  if (branch) nums.add(Number(branch[1]));
  return [...nums];
}

function pendingStagePr(prs, path) {
  return prs.find((pr) => (pr.files ?? []).some((f) => (f.path ?? f) === path || (f.path ?? f).startsWith(path)));
}

export function collect(cwd) {
  const def = resolveDefault(cwd);
  const gh = loadGh(cwd);
  const prs = gh.available ? gh.prs : [];

  const artifacts = {};
  for (const [key, { path, prPrefix, gateBranch }] of Object.entries(ARTIFACTS)) {
    const merged = artifactState(cwd, def.ref, path);
    const pr = merged ? null : pendingStagePr(prs, prPrefix);
    const localBranch = merged || pr ? null : pendingLocalBranch(cwd, def.ref, gateBranch, path);
    artifacts[key] = { path, merged, pendingPr: pr ? { number: pr.number, url: pr.url } : null, pendingBranch: localBranch };
  }

  const prsByIssue = new Map();
  for (const pr of prs) for (const n of linkedIssues(pr)) prsByIssue.set(n, { number: pr.number, url: pr.url });

  const all = gh.available ? gh.issues : [];
  const epics = all.filter((i) => has(i, "type:epic"));
  const stories = all
    .filter((i) => has(i, "type:story"))
    .map((s) => ({ number: s.number, title: s.title, stage: storyStage(s, prsByIssue), pr: prsByIssue.get(s.number) ?? null }))
    .sort((a, b) => a.number - b.number);

  const count = (stage) => stories.filter((s) => s.stage === stage).length;
  const summary = {
    epics: epics.length,
    stories: stories.length,
    backlog: count("backlog"),
    designApproved: count("design-approved"),
    readyForDev: count("ready-for-dev"),
    inReview: count("in-review"),
    done: count("done"),
  };

  return {
    cwd, defaultBranch: def.name, comparedTo: def.ref, fetched: def.fetched,
    github: gh.available ? "ok" : gh.reason, artifacts, summary, stories,
    next: nextStep(artifacts, stories, gh.available, def.name),
  };
}

export function nextStep(artifacts, stories, ghAvailable, defaultName = "main") {
  const waiting = (key, cmd) => {
    const a = artifacts[key];
    if (a.merged) return null;
    if (a.pendingPr) return { action: "merge", command: cmd, reason: `Revisar e mergear o PR #${a.pendingPr.number} (${a.path})`, pr: a.pendingPr };
    if (a.pendingBranch) {
      return { action: "merge", command: cmd, branch: a.pendingBranch, reason: `Revisar e mergear o branch ${a.pendingBranch} em ${defaultName}: sem PR no GitHub, o merge local é o gate` };
    }
    return { action: "run", command: cmd, reason: `${a.path} ainda não existe no branch padrão` };
  };

  const product = waiting("discovery", "/esteira:discovery") ?? waiting("prd", "/esteira:prd");
  if (product) return product;

  if (!ghAvailable) return { action: "setup", command: null, reason: "Conecte o repo ao GitHub (gh auth login + remoto) para seguir para o /backlog" };
  if (stories.length === 0) return { action: "run", command: "/esteira:backlog", reason: "Nenhuma story com a label type:story" };
  const specs = waiting("backlog", "/esteira:backlog");
  if (specs) return specs;

  const ds = waiting("designSystem", "/esteira:design-system");
  if (ds) return ds;

  const first = (stage) => stories.find((s) => s.stage === stage);
  const review = first("in-review");
  if (review) return { action: "run", command: `/esteira:review ${review.pr.number}`, reason: `PR #${review.pr.number} da story #${review.number} aguarda review`, story: review.number };
  const ready = first("ready-for-dev");
  if (ready) return { action: "run", command: `/esteira:dev ${ready.number}`, reason: `Story #${ready.number} está pronta para desenvolvimento`, story: ready.number };
  const designed = first("design-approved");
  if (designed) return { action: "run", command: `/esteira:spec ${designed.number}`, reason: `Story #${designed.number} tem protótipo aprovado e falta a spec técnica`, story: designed.number };
  const backlog = first("backlog");
  if (backlog) return { action: "run", command: `/esteira:prototipo ${backlog.number}`, reason: `Story #${backlog.number} ainda não tem protótipo aprovado`, story: backlog.number };

  return { action: "run", command: "/esteira:release", reason: "Todas as stories estão concluídas" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const cwd = resolve(process.argv[2] ?? process.cwd());
  process.stdout.write(JSON.stringify(collect(cwd), null, 2) + "\n");
}
