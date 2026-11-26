#!/usr/bin/env node
// Deixa o working tree no branch padrão atualizado antes de uma etapa ler artefatos aprovados.
// Ex.: depois de abrir o gate do discovery você fica em docs/discovery; o merge acontece no GitHub;
// /esteira:prd precisa ler o discovery.md aprovado, da main atual.
//
// node sync.mjs [diretorio] [--to <branch>]  → JSON { ok, synced, blocking, branch, switched, updated, reason }
// blocking: true quando parou para não perder trabalho (mudanças não commitadas, divergência).
// Nunca descarta trabalho: com mudanças não commitadas em arquivos rastreados, não troca de branch.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { git, print, parseArgs } from "./lib.mjs";
import { resolveDefault } from "./status.mjs";

// to: branch de destino (padrão: o branch padrão). Use o branch do gate (ex.: docs/discovery) para revisar um PR aberto.
export function sync(cwd, { to } = {}) {
  if (!git(cwd, "rev-parse", "--is-inside-work-tree").ok) return { ok: true, synced: false, blocking: false, reason: "Não é um repositório git: siga lendo os arquivos do disco." };
  const def = resolveDefault(cwd); // faz git fetch quando há remoto
  const target = to ?? def.name;
  if (!target) return { ok: true, synced: false, blocking: false, reason: "Branch padrão não encontrado (repo sem commits?)." };
  const hasOrigin = git(cwd, "remote", "get-url", "origin").ok;
  const remoteRef = `origin/${target}`;
  const hasRemoteRef = hasOrigin && git(cwd, "rev-parse", "--verify", "--quiet", `refs/remotes/${remoteRef}`).ok;

  const current = git(cwd, "branch", "--show-current").out;
  const dirty = git(cwd, "status", "--porcelain", "--untracked-files=no").out;
  if (current !== target && dirty) {
    return { ok: true, synced: false, blocking: true, branch: current, reason: `Há mudanças não commitadas em ${current}; não troquei para ${target}. Commite ou guarde antes.`, dirty: dirty.split("\n") };
  }

  let switched = false;
  if (current !== target) {
    const local = git(cwd, "rev-parse", "--verify", "--quiet", `refs/heads/${target}`).ok;
    if (!local && !hasRemoteRef) return { ok: false, error: `O branch ${target} não existe nem local nem em origin.` };
    const sw = local ? git(cwd, "switch", target) : git(cwd, "switch", "-c", target, "--track", remoteRef);
    if (!sw.ok) return { ok: false, error: `Não consegui trocar para ${target}: ${sw.err}` };
    switched = true;
  }

  let updated = false;
  if (hasRemoteRef) {
    const before = git(cwd, "rev-parse", "HEAD").out;
    const ff = git(cwd, "merge", "--ff-only", remoteRef);
    if (!ff.ok) return { ok: true, synced: false, blocking: true, branch: target, switched, reason: `${target} local divergiu de ${remoteRef}; não atualizei. Resolva manualmente.` };
    updated = git(cwd, "rev-parse", "HEAD").out !== before;
  }
  return { ok: true, synced: true, branch: target, switched, updated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  const result = sync(resolve(args._[0] ?? process.cwd()), { to: typeof args.to === "string" ? args.to : undefined });
  print(result, result.ok ? 0 : 1);
}
