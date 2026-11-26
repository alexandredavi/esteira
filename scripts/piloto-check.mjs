#!/usr/bin/env node
// Confere o que o piloto automático precisa para rodar com segurança (sem mudar nada).
//
// node piloto-check.mjs [--cwd repo]
// → JSON { ok, repo, allOk, checks: [{ id, ok, atual, comoCorrigir }] }
//
// - Credencial do Claude: secret ANTHROPIC_API_KEY ou CLAUDE_CODE_OAUTH_TOKEN.
// - ESTEIRA_PILOTO_TOKEN (recomendado): sem ele o CI do PR do piloto não aparece nos checks.
// - main exige PR, sem bypass: o piloto trabalha com um token de escrita; a garantia de que ele não
//   pula o gate humano (o merge) é a main não aceitar push direto de ninguém.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const json = (r) => { try { return r.ok ? JSON.parse(r.out || "null") : null; } catch { return null; } };

export function pilotoCheck(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const repo = json(gh(cwd, "repo", "view", "--json", "nameWithOwner,defaultBranchRef"));
  if (!repo) return { ok: false, error: "GitHub indisponível (sem remoto ou gh sem login)." };
  const main = repo.defaultBranchRef?.name ?? "main";

  const secrets = (json(gh(cwd, "secret", "list", "--json", "name")) ?? []).map((s) => s.name);
  const hasClaude = secrets.includes("ANTHROPIC_API_KEY") || secrets.includes("CLAUDE_CODE_OAUTH_TOKEN");

  // Ruleset (rules/branches) ou proteção clássica, ambas com "pull request obrigatório".
  const rules = json(gh(cwd, "api", `repos/{owner}/{repo}/rules/branches/${main}`)) ?? [];
  const prRule = Array.isArray(rules) ? rules.find((r) => r.type === "pull_request") : null;
  let protectedByPr = Boolean(prRule);
  let bypass = [];
  if (prRule?.ruleset_id) {
    const rs = json(gh(cwd, "api", `repos/{owner}/{repo}/rulesets/${prRule.ruleset_id}`));
    bypass = (rs?.bypass_actors ?? []).map((b) => `${b.actor_type}${b.actor_id ? `#${b.actor_id}` : ""}`);
  }
  if (!protectedByPr) {
    const classic = json(gh(cwd, "api", `repos/{owner}/{repo}/branches/${main}/protection`));
    if (classic?.required_pull_request_reviews) {
      protectedByPr = true;
      if (!classic.enforce_admins?.enabled) bypass = ["administradores (enforce_admins desligado)"];
    }
  }

  const checks = [
    {
      id: "credencial-claude",
      ok: hasClaude,
      atual: hasClaude ? "presente" : "faltando",
      comoCorrigir: "Crie o secret ANTHROPIC_API_KEY (API key com limite de gasto) ou CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) em Settings → Secrets and variables → Actions.",
    },
    {
      id: "token-piloto",
      ok: secrets.includes("ESTEIRA_PILOTO_TOKEN"),
      atual: secrets.includes("ESTEIRA_PILOTO_TOKEN") ? "presente" : "faltando (o CI do PR do piloto não aparece nos checks)",
      comoCorrigir: "Crie um token fine-grained só neste repo, com Contents, Pull requests e Issues em Read and write (sem Workflows), e salve como o secret ESTEIRA_PILOTO_TOKEN.",
    },
    {
      id: "main-exige-pr",
      ok: protectedByPr,
      atual: protectedByPr ? "exige PR" : "aceita push direto",
      comoCorrigir: `Settings → Rules → Rulesets → New branch ruleset: alvo ${main} (branch padrão), regra "Require a pull request before merging" (0 aprovações basta), sem bypass. Sem isso, o token do piloto consegue dar push direto na ${main} e pular o gate humano.`,
    },
    {
      id: "sem-bypass",
      ok: protectedByPr && bypass.length === 0,
      atual: !protectedByPr ? "—" : bypass.length ? `bypass: ${bypass.join(", ")}` : "ninguém pula a regra",
      comoCorrigir: "Remova os bypass do ruleset da main (ou ligue 'Do not allow bypassing'/'Include administrators'). O token do piloto é de uma pessoa: se ela pode pular a regra, o piloto também pode.",
    },
  ];
  return { ok: true, repo: repo.nameWithOwner, allOk: checks.every((c) => c.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = pilotoCheck(parseArgs(process.argv.slice(2)));
  print(result, result.ok ? 0 : 1);
}
