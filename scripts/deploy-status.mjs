#!/usr/bin/env node
// Estado dos deploys do produto, lido da API de deployments do GitHub (onde a Vercel publica).
//
// node deploy-status.mjs [--cwd repo]
// → JSON { ok, vercel, production, previews[], buildMigrates, notes[] }
// production = o ÚLTIMO deploy de produção (depois de um Instant Rollback, pode não ser o que está no ar).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const api = (cwd, path) => {
  const r = gh(cwd, "api", path);
  return r.ok ? JSON.parse(r.out || "null") : null;
};

function latestStatus(cwd, id) {
  const st = api(cwd, `repos/{owner}/{repo}/deployments/${id}/statuses?per_page=1`);
  const s = Array.isArray(st) ? st[0] : null;
  return s ? { state: s.state, url: s.environment_url || s.target_url || null } : { state: "unknown", url: null };
}

export function deployStatus(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const notes = [];
  const pkgPath = join(cwd, "package.json");
  const build = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.build ?? "" : "";
  const buildMigrates = build.includes("scripts/esteira/migrate.mjs");
  if (!buildMigrates) notes.push("O build ainda não migra o banco: rode /esteira:deploy para instalar a migração no build.");

  if (!gh(cwd, "repo", "view", "--json", "nameWithOwner").ok) {
    return { ok: true, github: "indisponível (sem remoto ou gh sem login)", vercel: "desconhecido", production: null, previews: [], buildMigrates, notes };
  }
  // Consultas filtradas (por ambiente e por branch), em vez de "os N mais recentes": num repo ativo,
  // o deploy de produção ou o preview de um PR antigo podem estar além da primeira página.
  const recent = api(cwd, "repos/{owner}/{repo}/deployments?per_page=10");
  if (!Array.isArray(recent)) return { ok: false, error: "Não consegui ler os deployments do repo (gh api)." };
  const byVercel = (list) => (Array.isArray(list) ? list : []).filter((d) => /vercel/i.test(d.creator?.login ?? ""));

  // A API devolve do mais novo para o mais antigo.
  const prod = byVercel(api(cwd, "repos/{owner}/{repo}/deployments?environment=Production&per_page=5"))[0] ?? null;
  const production = prod ? { sha: prod.sha.slice(0, 7), ref: prod.ref, createdAt: prod.created_at, ...latestStatus(cwd, prod.id) } : null;

  const prsOut = gh(cwd, "pr", "list", "--state", "open", "--json", "number,headRefName,title");
  const prs = prsOut.ok ? JSON.parse(prsOut.out || "[]") : [];
  let anyVercel = byVercel(recent).length > 0 || Boolean(prod);
  const previews = prs.map((pr) => {
    const list = byVercel(api(cwd, `repos/{owner}/{repo}/deployments?ref=${encodeURIComponent(pr.headRefName)}&per_page=5`));
    const d = list.find((x) => /preview/i.test(x.environment ?? ""));
    if (d) anyVercel = true;
    return { pr: pr.number, title: pr.title, ref: pr.headRefName, ...(d ? latestStatus(cwd, d.id) : { state: "sem deploy", url: null }) };
  });

  const vercel = anyVercel ? "conectada" : "não conectada";
  if (!anyVercel) notes.push("Nenhum deploy da Vercel neste repo: importe o repo em vercel.com/new (veja docs/deploy.md).");

  return { ok: true, github: "ok", vercel, production, previews, buildMigrates, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = deployStatus(parseArgs(process.argv.slice(2))); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
