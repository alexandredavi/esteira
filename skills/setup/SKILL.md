---
name: setup
description: Monta o app do produto no repo (Next.js App Router + TypeScript + Tailwind + shadcn/ui), liga a regra de lint do Design System, adiciona os workflows de CI e de labels dos gates e abre o PR de gate. Use quando a pessoa disser "/esteira:setup", "montar o app", "criar o projeto Next", ou quando o /esteira:status indicar esta etapa (episódio 0).
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) Read Glob
---

# /esteira:setup

Você monta o esqueleto técnico do produto. Quase tudo é determinístico, feito pelo script `setup.mjs`. O seu papel é rodar, verificar e explicar. Responda sempre em PT-BR.

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `artifacts.app.merged` é `true` → o app já está montado. Mostre o `next` e **pare**.
- `artifacts.app.pendingPr` ou `pendingBranch` → o setup já está aguardando merge. Mostre e pare.

## 1. Montar

Rode com a ferramenta **Bash**, com **timeout de 600000 ms** (leva de 1 a 3 minutos, porque baixa e instala dependências):

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs
```

O script gera o Next.js num diretório temporário e mescla no repo **sem sobrescrever** o que já existe. Depois instala as dependências, roda o shadcn (`init` + componentes base), registra a regra `esteira-ds/no-raw-styles` no ESLint e cria `.github/workflows/ci.yml` e `.github/workflows/esteira-gates.yml`.

- `ok: false` com `resumable: true` → algo falhou no meio (rede, npm, shadcn). Mostre o `error` e diga que **rodar `/esteira:setup` de novo retoma de onde parou**: o script só completa o que falta. Não abra o gate.
- `ok: false` sem `resumable` → mostre o `error` e pare.
- `resumed: true` → o setup completou um app que tinha ficado pela metade. Diga isso e siga normalmente.
- `already: true` → o app já está montado e completo. Se o artefato `app` ainda não estiver mergeado, siga para o passo 2 (verificar) e o passo 3 (gate), usando os `paths` da saída. Senão, diga isso e pare.

## 2. Verificar

Rode, com a ferramenta **Bash**:

```
npm run lint
npm run typecheck
npm run build
```

Os três precisam passar. Se algum falhar, mostre o erro e **pare sem abrir o gate**: um esqueleto quebrado contamina todas as etapas seguintes.

## 3. Abrir o gate

Junte os `paths` da saída do setup com vírgula e rode:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage setup --branch chore/setup --title "chore(setup): app Next.js + shadcn/ui + regra do Design System" --paths <paths separados por vírgula> --summary "<resumo sem aspas duplas, crases nem $: versões do Next e do shadcn, componentes instalados, workflows>"
```

Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 4. Fechar

Responda curto:

- Versões (`versions`) e componentes do shadcn instalados
- Resultado de lint, typecheck e build
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate.**"
- **Passos manuais**, que só a pessoa pode fazer:
  1. **Preview por PR:** conecte o repo na Vercel (vercel.com/new → Import Git Repository). Cada PR passa a ter uma URL de preview, que o `/esteira:prototipo` usa no gate.
  2. Para rodar local: `npm run dev` e abrir http://localhost:3000.
- O próximo passo, conforme o `/esteira:status`.

Não rode a próxima etapa.
