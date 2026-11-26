---
name: piloto
description: Piloto automático da esteira (episódio 12). Instala no produto um workflow do GitHub Actions que, quando uma story fica pronta para dev (spec aprovada), roda sozinho /esteira:dev → /esteira:testes → /esteira:review, cada etapa numa sessão nova do Claude Code, e para no comentário de review do PR (o merge continua humano). Também dispara o piloto para uma story à mão e mostra as execuções. Use quando a pessoa disser "/esteira:piloto", "ligar o piloto automático", "rodar a story #N no Actions", ou no episódio 12.
argument-hint: "[número da story para disparar | status] — padrão: instalar/verificar"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(gh secret list *) Bash(gh workflow run esteira-piloto.yml *) Bash(gh run list *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(gh secret list *) PowerShell(gh workflow run esteira-piloto.yml *) PowerShell(gh run list *) Read Glob
---

# /esteira:piloto

Você liga (ou dispara) o piloto automático: depois que a spec de uma story é aprovada, o GitHub Actions faz dev, testes de aceite e review sozinho, cada etapa numa **sessão nova** do Claude Code. O merge continua humano. Responda sempre em PT-BR.

Pedido: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`). Se um script da esteira falhar, mostre o erro e pare.

## `status` — ver as execuções

Rode `gh run list --workflow esteira-piloto.yml --limit 5` e mostre uma tabela: story (do título), estado, há quanto tempo e link. Pare aqui.

## `<número>` — disparar para uma story

1. `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .`: a story precisa estar `ready-for-dev` em `stories[]`, ou ter `status: spec` em `specs[]`. Se não estiver, diga qual etapa falta e pare.
2. `gh workflow run esteira-piloto.yml -f story=<número>`
3. `gh run list --workflow esteira-piloto.yml --limit 1`: mostre o link da execução.

Pare aqui.

## Padrão — instalar e verificar

### 1. Pré-checagem

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `github` diferente de `"ok"` → o piloto roda no GitHub Actions: sem GitHub não há piloto. Diga isso e pare.
- `artifacts.app.merged` é `false` → falta o `/esteira:setup`. Pare.

### 2. Instalar

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs piloto
```

Instala `.github/workflows/esteira-piloto.yml` e atualiza o `esteira-gates.yml` (passa a disparar o piloto quando uma spec é aprovada) e o `ci.yml` (aceita `workflow_dispatch`, porque o PR aberto pelo piloto não dispara o CI sozinho). Workflows customizados **não** são sobrescritos: os `notes` dizem o que acrescentar à mão.

Se `changed` não estiver vazio, abra o gate:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage piloto --branch chore/piloto --allow-missing --title "chore(piloto): piloto automático no GitHub Actions" --paths .github/workflows --summary "<resumo sem aspas duplas, crases nem $>"
```

### 3. Credencial (a pessoa faz)

Rode `gh secret list` (só mostra **nomes**, nunca valores) e veja se existe `ANTHROPIC_API_KEY` ou `CLAUDE_CODE_OAUTH_TOKEN`. Se não existir nenhum, explique as duas opções. **A pessoa** cria o secret; você nunca pede, lê nem grava chave.

- **`ANTHROPIC_API_KEY`**: uma API key do console da Anthropic, **com limite de gasto** configurado. Cada story custa, em ordem de grandeza, de US$ 3 a 6 (dev, testes e review).
- **`CLAUDE_CODE_OAUTH_TOKEN`**: usa a assinatura do Claude. Gere com `claude setup-token` no terminal.

Depois: *Settings → Secrets and variables → Actions → New repository secret*.

### 4. Fechar

Responda curto:

- O que foi instalado (e o link do PR)
- A credencial: presente ou faltando, e como criar
- Como funciona:
  1. o merge do PR da spec aplica `ready-for-dev` e dispara o piloto;
  2. ele roda dev, testes e review;
  3. o PR fica com o review comentado, esperando o **seu merge**.
- Como acompanhar: `/esteira:piloto status`. Para disparar à mão: `/esteira:piloto <story>`.

Não dispare o piloto sem a pessoa pedir.
