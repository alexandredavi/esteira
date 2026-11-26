---
name: status
description: Mostra em que etapa da esteira está o produto (discovery, PRD, backlog, design system, protótipo, spec, dev, review, release) e qual é o próximo comando a rodar. Use quando a pessoa perguntar "status da esteira", "onde estamos", "qual o próximo passo", "o que falta", ou ao abrir uma sessão no repo do produto.
argument-hint: "[caminho-do-repo-do-produto]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Read
---

# /esteira:status

Mostre o estado da esteira no repo do produto e o próximo passo. Esta skill **só lê**: não cria arquivos, issues, labels nem PRs.

## 1. Coletar

Rode exatamente este comando, com a ferramenta **Bash** (também funciona no Windows via Git Bash), sem prefixos nem `cd`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs $ARGUMENTS .
```

(se `$ARGUMENTS` vier vazio, o `.` final aponta para o diretório atual). A saída é JSON com:

- `artifacts.{discovery,prd,designSystem}` — `merged` (está no branch padrão) e `pendingPr` (PR aberto que cria o arquivo)
- `github` — `"ok"` ou o motivo de não conseguir ler issues/PRs
- `summary` — contagem de épicos e stories por estágio
- `stories[]` — `number`, `title`, `stage` (`backlog` → `design-approved` → `ready-for-dev` → `in-review` → `done`), `pr`
- `next` — `action` (`run` | `merge` | `setup`), `command`, `reason`

Não reinterprete o estado por conta própria: o script é a fonte da verdade. Se ele falhar, mostre o erro e pare.

## 2. Apresentar

Responda em PT-BR, curto, neste formato:

```
**Produto:** <nome do diretório> · branch padrão `<defaultBranch>` · GitHub: <ok | motivo>

| Etapa | Estado |
|---|---|
| Discovery | ✅ mergeado / 🔶 PR #n aguardando merge / ⬜ pendente |
| PRD | … |
| Backlog | <n> épicos, <n> stories (ou ⬜ pendente) |
| Design System | … |
| Stories | backlog <n> · protótipo aprovado <n> · prontas p/ dev <n> · em review <n> · concluídas <n> |

**Próximo passo:** `<next.command>` — <next.reason>
```

- `action: "merge"` → o próximo passo é **seu merge** no PR indicado (é o gate humano); mostre o link e diga que, depois do merge, o comando seguinte destrava.
- `action: "setup"` → explique o que configurar (`gh auth login`, criar o repo no GitHub e o remoto) antes de seguir.
- Se houver stories, liste até 5 abaixo da tabela com `#número título — estágio`, priorizando as que estão em review e prontas para dev.

Não rode o próximo comando automaticamente — só indique.
