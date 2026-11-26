---
name: release
description: Etapa de release da esteira. Instala o release-please (versão e CHANGELOG.md a partir dos Conventional Commits dos PRs), mostra o Release PR aberto com o que entra na próxima versão e devolve à pessoa o merge do Release PR, que é o gate que cria a tag e a release. Use quando a pessoa disser "/esteira:release", "lançar uma versão", "gerar o changelog", ou quando o /esteira:status indicar esta etapa.
argument-hint: ""
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(gh pr list *) Bash(gh pr view *) Bash(gh release list *) Bash(gh api repos/{owner}/{repo}/actions/permissions/workflow) Bash(git log *) Bash(git tag *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(gh pr list *) PowerShell(gh pr view *) PowerShell(gh release list *) PowerShell(git log *) PowerShell(git tag *) Read Glob Grep
---

# /esteira:release

Você publica uma versão do produto. Quem calcula a versão e escreve o `CHANGELOG.md` é o **release-please**, a partir dos títulos dos PRs (Conventional Commits: `feat:`, `fix:`, `docs:`… que a esteira já usa). O seu papel é instalar, mostrar o que entra na versão e devolver o merge do Release PR para a pessoa. Responda sempre em PT-BR.

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`.

## 0. Pré-checagem

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `github` diferente de `"ok"` → o release-please roda no GitHub Actions: sem GitHub não há release. Diga isso e pare.
- Stories em `in-review` → avise que esses PRs ainda não entram na versão. Siga, porque a decisão de esperar é da pessoa.

## 1. Instalar (primeira vez)

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs release
```

Se `changed` não estiver vazio, abra o gate:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage release --branch chore/release-please --allow-missing --title "chore(release): release-please com changelog em PT-BR" --paths .github/workflows/release-please.yml,release-please-config.json,.release-please-manifest.json --summary "<resumo sem aspas duplas, crases nem $>"
```

**Permissão do repo:** o release-please abre PRs com o `GITHUB_TOKEN`. Confira com `gh api repos/{owner}/{repo}/actions/permissions/workflow`. Se `can_approve_pull_request_reviews` for `false` ou `default_workflow_permissions` for `read`, a pessoa precisa ligar em *Settings → Actions → General → Workflow permissions*: **Read and write** e **Allow GitHub Actions to create and approve pull requests**. Mudar configuração do repo é decisão dela: explique e **não** altere você.

Depois do merge desse PR, o próximo push na `main` faz o release-please abrir o Release PR.

## 2. Mostrar a próxima versão

```
gh pr list --state open --label "autorelease: pending" --json number,title,url,body
gh release list --limit 3
```

- **Há Release PR** → mostre a versão (no título), as seções do changelog do corpo (Novidades, Correções…) e o link.
- **Não há** → olhe `git log <última tag>..HEAD --oneline` (`git tag --sort=-v:refname` dá a última tag). Se houver `feat:` ou `fix:` depois da tag e o workflow já estiver instalado, o Release PR deve aparecer em instantes, depois do push na `main`. Se só houver `docs:`/`chore:`, não há versão nova: o release-please só sobe versão com `feat` ou `fix`.
- Commits que não seguem o padrão (sem `tipo:`) não entram no changelog. Liste-os, se houver, para a pessoa saber.

## 3. Fechar

Responda curto:

- Versão atual (última release) → próxima versão (do Release PR)
- O que entra: as seções do changelog
- Link do Release PR e: "**Revise e mergeie o Release PR. O merge é o gate**: cria a tag `vX.Y.Z`, a release no GitHub e atualiza o `CHANGELOG.md`. O deploy de produção já acontece a cada merge na `main`; a release marca a versão."

Não mergeie o Release PR.
