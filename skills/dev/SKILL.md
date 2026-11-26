---
name: dev
description: Etapa de desenvolvimento da esteira. Para uma story com spec técnica aprovada, implementa conforme a seção Técnica (schema e migração, regras de negócio com testes de unidade, server actions, troca dos mocks do protótipo por dados reais), verifica lint/tipos/testes/build e abre o PR da story com "Closes #N". O CI fica vermelho na rastreabilidade até o /esteira:testes. Use quando a pessoa disser "/esteira:dev", "implementar a story #N", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número da story — padrão: a próxima pronta para dev]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) Bash(npx shadcn@4.23.1 add *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) PowerShell(npx shadcn@4.23.1 add *) Bash(git rm *) PowerShell(git rm *) Read Write Edit Glob Grep
---

# /esteira:dev

Você implementa a story **exatamente como a seção Técnica da spec aprovada descreve**, partindo do protótipo, que já é o começo do app. O resultado é **um PR** com `Closes #<n>`. Responda sempre em PT-BR.

Story pedida: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento. Para apagar um arquivo, use `git rm <caminho>`: é o único comando de remoção liberado (`rm` e `Remove-Item` pedem aprovação).

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `sync` com `blocking: true` → mostre o `reason` e pergunte antes de seguir.
- Story: o número em `$ARGUMENTS`; ou, se o `next.command` for `/esteira:dev <n>`, esse `<n>`.
- O `status` da spec dela em `specs[]` (no branch padrão):
  - `spec` → spec técnica aprovada: siga.
  - `backlog` ou `design` → falta etapa anterior. Diga qual (`/esteira:prototipo` ou `/esteira:spec`) e pare.
  - `dev` ou `done` → já implementada. Diga isso e pare.
  - `status` ausente (`null`, spec anterior à esteira F3) → use o estágio da story em `stories[]`: `ready-for-dev` vale como `spec`.
- Story em `in-review` em `stories[]` → o PR de dev já existe. Para continuar nele: `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to feat/<n>-<slug>`.

Leia com a ferramenta **Read**: a spec inteira (Produto, Design e **Técnica**), `AGENTS.md`, o código do protótipo citado na seção Design, `src/db/schema.ts` e `src/lib/domain/` (o que já existe), e `docs/design/README.md`.

## 1. Preparar as camadas

Rode com a ferramenta **Bash**, com **timeout de 600000 ms**, porque instala pacotes:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs db
node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs tests
```

O `db` só é necessário se a Técnica tiver modelo de dados. O `tests` vale sempre, porque instala Vitest, Playwright e a rastreabilidade. Os dois são idempotentes. Guarde os `paths` que eles devolvem: vão para o PR. `notes` não vazias → mostre no final.

## 2. Implementar, nesta ordem

1. **Schema**: as tabelas da Técnica em `src/db/schema.ts`. Depois rode `npm run db:generate` (timeout de 120000 ms), que cria a migração em `drizzle/`. **Só acrescente** tabelas e colunas: renomear ou apagar coluna faz o `drizzle-kit` abrir uma pergunta interativa, que trava aqui. Se a Técnica exigir renomear, crie a coluna nova, migre os dados e deixe a remoção para outra story. Se o comando travar ou perguntar algo, pare e explique.
2. **Regras de negócio** em `src/lib/domain/<dominio>.ts`: funções que recebem `db: Db` (de `@/db`) por parâmetro. **Testes de unidade** ao lado (`<dominio>.test.ts`, Vitest), com `criarDbDeTeste()` de `@/db/testing`: um banco novo por teste, cobrindo as regras e os erros.
3. **Server actions** em `src/app/<rota>/actions.ts` (`"use server"`): chamam `getDb()` e a função de domínio, e devolvem erros em PT-BR para a UI mostrar. Use `revalidatePath` depois de escrever.
4. **Troca dos mocks**: as telas do protótipo passam a ler e escrever dados reais, conforme a tabela "Troca dos mocks". Leitura em server component dentro de `<Suspense>` (chame `await connection()` de `next/server` antes de ler o banco). Os **estados reais** substituem o `?estado=`: lista vazia, o fallback do Suspense e `error.tsx`. Apague os mocks que ficaram sem uso.
5. Mantenha a UI do protótipo, que já foi aprovada no gate. Mudanças de UI só se a Técnica pedir.

Regras do código:

- Só tokens do DS (a regra `esteira-ds/no-raw-styles` vale). Sem `eslint-disable`.
- Sem `any`. Os tipos vêm do schema: `typeof tabela.$inferSelect`.
- **Sem `db.transaction()`**: o Neon via HTTP não tem, e o banco local também a bloqueia. Operação atômica é um único comando SQL (CTE).
- Não escreva os testes de aceite (`e2e/`): isso é do `/esteira:testes`.

## 3. Verificar

Rode com a ferramenta **Bash**:

```
npm run lint
npm run typecheck
npm run test
npm run build
```

Os quatro precisam passar. Corrija e rode de novo.

## 4. Marcar a spec e abrir o PR

1. No frontmatter da spec, troque `status: spec` por `status: dev`. Se a implementação precisou divergir da Técnica, acrescente ao fim da seção uma subseção `### Notas de implementação` com o que mudou e por quê.
2. Rode:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage dev --branch feat/<n>-<slug> --closes <n> --allow-missing --title "feat(#<n>): <título da story>" --paths src,drizzle,e2e,scripts,<caminho da spec>,package.json,package-lock.json,next.config.ts,drizzle.config.ts,vitest.config.ts,playwright.config.ts,.github,.gitignore --summary "<resumo sem aspas duplas, crases nem $: tabelas, regras, actions, mocks trocados, testes de unidade>"
```

Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 5. Fechar

Responda curto:

- O que foi implementado (tabelas, regras, actions, telas ligadas a dados reais)
- Testes de unidade: quantos e o que cobrem
- Link do PR e: "**O CI deste PR vai falhar na rastreabilidade**: a story está em dev e os critérios de aceite ainda não têm teste. É de propósito, a esteira não deixa código sem teste de aceite passar. Rode `/esteira:testes <n>`."

Não rode a próxima etapa.
