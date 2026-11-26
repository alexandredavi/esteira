---
name: review
description: Etapa de review da esteira. Revisa o PR de uma story com um subagente revisor sem contexto de quem escreveu (spec × código, dados, segurança, testes de aceite, DS, Next 16), confere o CI e a rastreabilidade, publica o resultado como comentário de review no PR e devolve a decisão de merge para a pessoa (o gate humano). Use quando a pessoa disser "/esteira:review", "revisar o PR #N", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número do PR — padrão: o PR da story em review]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(gh pr view *) Bash(gh pr checks *) Bash(gh pr review *) Bash(git diff *) Bash(git log *) Bash(npm run *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(gh pr view *) PowerShell(gh pr checks *) PowerShell(gh pr review *) PowerShell(git diff *) PowerShell(git log *) PowerShell(npm run *) Read Write Glob Grep Agent
---

# /esteira:review

Você coordena a revisão do PR de uma story. A revisão em si é feita pelo subagente **`esteira:reviewer`**, que não viu o código ser escrito. Uma revisão independente acha o que quem escreveu não vê. Você **não aprova nem mergeia**: isso é o gate humano. Responda sempre em PT-BR.

PR pedido: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`. Comandos compostos pedem aprovação e travam a etapa. Para escrever arquivo, use a ferramenta Write.

## 0. Pré-checagem

1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .` (Bash). O PR é o de `$ARGUMENTS`, ou o `pr` da story em `in-review` em `stories[]`.
   - `next.command` é `/esteira:testes <n>` para essa story → os testes de aceite ainda não existem. Diga para rodar `/esteira:testes <n>` antes e **pare**: não se revisa código sem teste de aceite.
2. Com GitHub: `gh pr view <PR> --json number,title,url,headRefName,body,author` e `gh pr checks <PR>`. Guarde o `headRefName` e a situação do CI.
   **Sem GitHub** (`github` diferente de `"ok"`): a revisão é local. O "PR" é o branch `feat/<n>-<slug>` contra o branch padrão, e o resultado fica só em arquivo.
3. `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to <headRefName>`. Com `blocking: true`, mostre o `reason` e pergunte.

Ache a story pelo `Closes #<n>` do corpo do PR ou pelo nome do branch (`feat/<n>-…`) e leia a spec `docs/specs/<n>-<slug>.md`.

## 1. Checagens determinísticas

Rode com a ferramenta **Bash**:

```
npm run trace
npm run lint
npm run typecheck
npm run test
```

Anote o resultado de cada uma. O CI do PR (`gh pr checks`) é a fonte para o build e os testes de aceite. Localmente eles são lentos e já rodam lá.

## 2. Revisão independente

Delegue ao subagente **`esteira:reviewer`** (ferramenta Agent). Passe **só** o número da story, o caminho da spec e o comando do diff, `git diff origin/<padrão>...HEAD` (sem remoto: `git diff <padrão>...HEAD`). **Não** passe a sua opinião nem um resumo do código: a revisão precisa ser independente.

## 3. Publicar

Escreva `.esteira/review-<PR ou branch>.md` com a ferramenta Write (no nome do branch, troque `/` por `-`):

```
## Review da esteira — #<n> <título da story>

| Checagem | Resultado |
|---|---|
| CI do PR | ✅ / ❌ <checks que falharam> / ⏳ |
| Rastreabilidade | ✅ <x/x ACs> / ❌ |
| Lint · tipos · unidade | ✅ / ❌ |

<a tabela de achados, o "Conferido e ok" e o veredito do subagente, sem editar o conteúdo>

---
Revisão por IA (subagente sem contexto de quem escreveu). **A decisão de merge é humana.**
```

Com GitHub, publique como **comentário de review** (o autor do PR não pode aprovar nem pedir mudanças no próprio PR, então é sempre `--comment`):

```
gh pr review <PR> --comment --body-file .esteira/review-<PR>.md
```

## 4. Fechar

Responda curto:

- Checagens (CI, rastreabilidade, lint, tipos, unidade)
- Achados por gravidade (Bloqueia / Importante / Menor), com o veredito
- Link do review no PR (ou o caminho do arquivo, sem GitHub)
- Próximo passo:
  - **Algum "Bloqueia" ou CI vermelho** → "Corrija no mesmo PR com `/esteira:dev <n>` (ele continua no branch do PR) e rode `/esteira:review` de novo."
  - **Sem bloqueio e CI verde** → "**A decisão é sua: revise o preview e mergeie o PR. O merge é o gate**, e a issue fecha sozinha. Depois, `/esteira:status` mostra a próxima story."

Não mergeie, não aprove e não corrija código nesta etapa.
