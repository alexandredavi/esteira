---
name: prd
description: Segunda etapa da esteira. A partir do discovery aprovado, escreve docs/product/prd.md (visão, objetivos e métricas, capacidades do MVP com IDs CAP-n, fora de escopo, requisitos não funcionais) e abre o PR de gate. Use quando a pessoa disser "/esteira:prd", "vamos escrever o PRD", "definir o escopo do MVP", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[orientação extra de escopo, opcional]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Read Write Edit Glob Grep AskUserQuestion
---

# /esteira:prd

Você escreve o PRD do MVP a partir do discovery aprovado. O resultado é **um arquivo** (`docs/product/prd.md`) aprovado por **um PR**. Responda sempre em PT-BR.

Orientação extra: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

O `sync` volta para o branch padrão e traz o que foi mergeado no GitHub (só se não houver mudanças não commitadas). Se ele responder `blocking: true`, mostre o `reason` e pergunte antes de seguir. Com `synced: false` e `blocking: false` (ex.: não é repo git), siga normalmente.

Se `artifacts.discovery.pendingBranch` existir (gate só local, sem GitHub), a pessoa precisa mergear esse branch no padrão antes: diga isso e pare.

- `artifacts.discovery.merged` é `false` → o PRD depende do discovery aprovado. Diga que falta o discovery (rodar `/esteira:discovery` ou mergear o PR dele) e **pare**. Não use o `next` aqui: ele pode apontar para o `/esteira:setup`, que o PRD não exige.
- `artifacts.prd.merged` é `true` → o PRD já está aprovado. Mostre o `next` e pare.
- `artifacts.prd.pendingPr` existe → pergunte se a pessoa quer revisar o arquivo existente ou parar. Para revisar: rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to docs/prd` para voltar ao branch do PR, edite e rode o passo 4 de novo, que atualiza o mesmo PR.

Leia `docs/product/discovery.md` inteiro.

## 1. Rascunho das capacidades

A partir dos jobs to be done e da proposta de valor, liste **capacidades candidatas**: o que a pessoa consegue fazer, sem telas nem tecnologia. Cada capacidade aponta para um job.

Classifique cada uma como **MVP** (sem ela a proposta de valor não se sustenta) ou **Depois**. O MVP deve ser o menor recorte que entrega a proposta de valor para a persona principal. Na dúvida, vai para Depois.

## 2. Entrevista (uma rodada)

Mostre a lista classificada e faça **uma única rodada** de até 4 perguntas, cada uma com a sua recomendação, para que "sim" aceite a recomendação. Use AskUserQuestion quando disponível:

1. **Corte do MVP**: a classificação MVP / Depois está certa?
2. **Métrica principal**: qual número diz que o MVP funcionou? Proponha uma.
3. **Requisitos não funcionais** que mudam decisão (ex.: LGPD, mobile first, offline).
4. **Orientação extra** (`$ARGUMENTS`), se veio, e o que ela muda.

**Sem como perguntar**: siga com as recomendações e registre cada uma em "Premissas e dependências".

## 3. Escrever o artefato

Leia o template `${CLAUDE_PLUGIN_ROOT}/templates/prd.md` com a ferramenta **Read** (não use `cat`: o plugin fica fora do diretório de trabalho) e escreva `docs/product/prd.md`:

- Preencha **todas** as seções, troque os `{{…}}` e **remova os comentários `<!-- -->`**.
- Capacidades do MVP com IDs `CAP-1`, `CAP-2`… em ordem de prioridade. **Esses IDs são estáveis**, porque o backlog cria um épico por CAP.
- Cada CAP tem job atendido, descrição e regras de negócio.
- "Fora de escopo" recebe tudo o que ficou em Depois, com motivo e quando volta.
- Use a mesma linguagem do discovery (nome do produto, personas P1/P2).
- Conteúdo enxuto: de 3 a 7 capacidades no MVP.

## 4. Abrir o gate

Rode com a ferramenta **Bash**, com um resumo de 2 a 4 frases **sem aspas duplas, crases nem `$`** (cite quantas CAPs e a métrica principal):

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage prd --branch docs/prd --title "docs(prd): escopo do MVP" --paths docs/product/prd.md --summary "<resumo>"
```

Leia o JSON: `opened: true` → link do PR. `opened: false` → mostre o `reason`. `ok: false` → mostre o `error` e pare.

## 5. Fechar

Responda curto:

- Visão (uma frase)
- Tabela `CAP | nome | job`
- O que ficou fora do MVP (uma linha)
- Métrica principal
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate.** Depois, rode `/esteira:backlog`."

Não rode a próxima etapa.
