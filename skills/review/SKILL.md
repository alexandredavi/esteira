---
name: review
description: Etapa de review da esteira. Revisa o PR de uma story numa sessão sem contexto de quem escreveu, com o checklist do revisor da esteira (spec × código, dados, segurança, testes de aceite, DS, Next 16), confere o CI e a rastreabilidade, publica o resultado como comentário de review no PR e devolve a decisão de merge para a pessoa (o gate humano). Use quando a pessoa disser "/esteira:review", "revisar o PR #N", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número do PR — padrão: o PR da story em review]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(gh pr view *) Bash(gh pr checks *) Bash(gh pr review *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(npm run *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(gh pr view *) PowerShell(gh pr checks *) PowerShell(gh pr review *) PowerShell(git diff *) PowerShell(git log *) PowerShell(git show *) PowerShell(npm run *) Read Write Glob Grep
---

# /esteira:review

Você revisa o PR de uma story **sem ter escrito o código**. Uma revisão independente acha o que quem escreveu não vê.

> **Independência:** rode o `/esteira:review` numa **sessão nova** do Claude Code (outra janela, ou `/clear` antes), nunca na mesma conversa que implementou a story. Se esta conversa escreveu o código do PR, diga isso e peça para rodar numa sessão nova: não revise.
>
> A revisão é feita **por você, neste turno**, e não por um subagente. O resultado de um subagente chega num turno seguinte, em que as permissões desta skill já não valem, e o review não seria publicado. Você **não aprova nem mergeia**: isso é o gate humano. Responda sempre em PT-BR.

PR pedido: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`. Comandos compostos pedem aprovação e travam a etapa. Para escrever arquivo, use a ferramenta Write.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

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

## 2. Revisão

Leia com a ferramenta **Read** o checklist do revisor em `${CLAUDE_PLUGIN_ROOT}/agents/reviewer.md` e siga-o à risca: o que verificar, a gravidade e o formato da saída (tabela de achados, "Conferido e ok", veredito). O código a revisar é o diff `git diff origin/<padrão>...HEAD` (sem remoto: `git diff <padrão>...HEAD`) e os arquivos que ele toca. Revise **o que está commitado**: mudanças não commitadas no working tree não fazem parte do PR.

## 3. Publicar

Escreva `.esteira/review-<PR ou branch>.md` com a ferramenta Write (no nome do branch, troque `/` por `-`):

```
## Review da esteira — #<n> <título da story>

| Checagem | Resultado |
|---|---|
| CI do PR | ✅ / ❌ <checks que falharam> / ⏳ |
| Rastreabilidade | ✅ <x/x ACs> / ❌ |
| Lint · tipos · unidade | ✅ / ❌ |

<a tabela de achados, o "Conferido e ok" e o veredito>

---
Revisão por IA, numa sessão sem contexto de quem escreveu. **A decisão de merge é humana.**
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
