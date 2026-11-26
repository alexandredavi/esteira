#!/usr/bin/env node
// Confere as configurações do repo que o release-please precisa (sem mudar nada).
//
// node release-check.mjs [--cwd repo]
// → JSON { ok, checks: [{ id, ok, atual, esperado, comoCorrigir }], allOk }
//
// - Workflow com permissão de escrita e podendo abrir PR (o release-please abre o Release PR).
// - Só "squash merge", com o título do PR como mensagem: cada story entra na main como UM commit
//   Conventional ("feat(#10): …"), e o changelog não repete entradas.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const json = (r) => (r.ok ? JSON.parse(r.out || "null") : null);

export function releaseCheck(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const repo = json(gh(cwd, "repo", "view", "--json", "nameWithOwner"));
  if (!repo) return { ok: false, error: "GitHub indisponível (sem remoto ou gh sem login)." };
  const perms = json(gh(cwd, "api", "repos/{owner}/{repo}/actions/permissions/workflow"));
  const settings = json(gh(cwd, "api", "repos/{owner}/{repo}"));
  if (!perms || !settings) return { ok: false, error: "Não consegui ler as configurações do repo (gh api)." };

  const checks = [
    {
      id: "workflow-write",
      ok: perms.default_workflow_permissions === "write",
      atual: perms.default_workflow_permissions,
      esperado: "write",
      comoCorrigir: "Settings → Actions → General → Workflow permissions → Read and write permissions",
    },
    {
      id: "workflow-pr",
      ok: perms.can_approve_pull_request_reviews === true,
      atual: perms.can_approve_pull_request_reviews,
      esperado: true,
      comoCorrigir: "Settings → Actions → General → marque Allow GitHub Actions to create and approve pull requests",
    },
    {
      id: "squash-only",
      ok: settings.allow_squash_merge === true && settings.allow_merge_commit === false && settings.allow_rebase_merge === false,
      atual: { squash: settings.allow_squash_merge, mergeCommit: settings.allow_merge_commit, rebase: settings.allow_rebase_merge },
      esperado: { squash: true, mergeCommit: false, rebase: false },
      comoCorrigir: `gh repo edit ${repo.nameWithOwner} --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false`,
    },
    {
      id: "squash-title",
      ok: settings.squash_merge_commit_title === "PR_TITLE",
      atual: settings.squash_merge_commit_title,
      esperado: "PR_TITLE",
      comoCorrigir: "Settings → General → Pull Requests → Allow squash merging → Default commit message: Pull request title",
    },
  ];
  return { ok: true, repo: repo.nameWithOwner, allOk: checks.every((c) => c.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = releaseCheck(parseArgs(process.argv.slice(2)));
  print(result, result.ok ? 0 : 1);
}
