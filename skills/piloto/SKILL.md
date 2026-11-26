---
name: piloto
description: Piloto automático da esteira (episódio 12). Instala no produto um workflow do GitHub Actions que, quando uma story fica pronta para dev (spec aprovada), roda sozinho /esteira:dev → /esteira:testes → /esteira:review, cada etapa numa sessão nova do Claude Code, e para no comentário de review do PR (o merge continua humano). Também dispara o piloto para uma story à mão e mostra as execuções. Use quando a pessoa disser "/esteira:piloto", "ligar o piloto automático", "rodar a story #N no Actions", ou no episódio 12.
argument-hint: "[número da story para disparar | status] — padrão: instalar/verificar"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/piloto-check.mjs *) Bash(gh workflow run esteira-piloto.yml *) Bash(gh run list *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/piloto-check.mjs *) PowerShell(gh workflow run esteira-piloto.yml *) PowerShell(gh run list *) Read Glob
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
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/piloto-check.mjs .`: se `main-exige-pr` ou `sem-bypass` falharem, **não dispare**. Explique o risco e o `comoCorrigir`.
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

### 3. Conferir (a pessoa configura)

Rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/piloto-check.mjs .`. Ele confere, sem mudar nada: a credencial do Claude, o token do piloto (só os **nomes** dos secrets) e se a **main exige PR, sem bypass**. Mostre cada check com `ok: false` e o `comoCorrigir`.

**A main exigir PR é obrigatório antes de ligar o piloto.** O modelo trabalha com um token de escrita durante o dev e os testes. O que garante tecnicamente que ele não pula o gate humano (o merge) é a main não aceitar push direto de ninguém. Se `main-exige-pr` ou `sem-bypass` falharem, diga isso com clareza e recomende não disparar o piloto até a pessoa criar o ruleset.

Os secrets: **A pessoa** cria os secrets em *Settings → Secrets and variables → Actions*; você nunca pede, lê nem grava chave ou token.

**a) Token do piloto: `ESTEIRA_PILOTO_TOKEN` (recomendado).** Com ele, o push e o PR do piloto saem como a pessoa, e o **CI normal do PR roda e aparece nos checks**. Sem ele, o PR é aberto pelo bot do Actions, que não dispara o CI do PR; o piloto dispara o CI à mão, mas o resultado só aparece no Actions, não nos checks do PR. Para criar:

1. github.com/settings/personal-access-tokens/new → *Fine-grained token*, com validade curta (ex.: 90 dias).
2. *Repository access*: **só este repo**.
3. *Permissions*: Contents, Pull requests e Issues em **Read and write**. **Não** dê Workflows: o piloto não precisa, e um workflow novo poderia ler os secrets do repo.
4. Salve como o secret `ESTEIRA_PILOTO_TOKEN`.

**b) Credencial do Claude: uma das duas.**

- **`ANTHROPIC_API_KEY`**: uma API key do console da Anthropic, **com limite de gasto** configurado. Cada story custa, em ordem de grandeza, de US$ 3 a 6 (dev, testes e review).
- **`CLAUDE_CODE_OAUTH_TOKEN`**: usa a assinatura do Claude. Gere com `claude setup-token` no terminal.

Depois: *Settings → Secrets and variables → Actions → New repository secret*.

### 4. Fechar

Responda curto:

- O que foi instalado (e o link do PR)
- O resultado do `piloto-check`: credencial, token e a proteção da main
- Como funciona:
  1. o merge do PR da spec aplica `ready-for-dev` e dispara o piloto;
  2. ele roda dev, testes e review;
  3. o PR fica com o review comentado, esperando o **seu merge**.
- Como acompanhar: `/esteira:piloto status`. Para disparar à mão: `/esteira:piloto <story>`.

Não dispare o piloto sem a pessoa pedir.
