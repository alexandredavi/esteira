---
name: spec
description: Etapa de spec técnica da esteira. Para uma story com protótipo aprovado, escreve a seção Técnica da spec (modelo de dados, regras de negócio, contratos, troca dos mocks, estados reais, plano de testes por critério de aceite) e abre o PR de gate (o merge aplica spec:approved e ready-for-dev). Use quando a pessoa disser "/esteira:spec", "escrever a spec técnica da story #N", "desenhar a implementação", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número da story — padrão: a próxima com protótipo aprovado]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Read Write Edit Glob Grep AskUserQuestion
---

# /esteira:spec

Você desenha **como** a story será implementada, a partir do que o protótipo aprovado mostra que ela **faz**. O resultado é a seção `## Técnica` da spec, aprovada por **um PR**. Você não escreve código de produção nesta etapa. Responda sempre em PT-BR.

Story pedida: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`. Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `sync` com `blocking: true` → mostre o `reason` e pergunte antes de seguir.
- Story: o número em `$ARGUMENTS`; ou, se o `next.command` for `/esteira:spec <n>`, esse `<n>`.
- Em `specs[]`, encontre a spec da story. O `status` dela (no branch padrão) diz o que já foi aprovado:
  - `design` → protótipo aprovado: siga.
  - `backlog` → falta o protótipo. Diga para rodar `/esteira:prototipo <n>` e pare.
  - `spec`, `dev` ou `done` → esta etapa já passou. Diga isso e pare.
  - `status` ausente (`null`, spec anterior à esteira F3) → use o estágio da story em `stories[]`: `design-approved` vale como `design`.
- Se a story estiver em `spec-review` em `stories[]` → já há PR aberto. Para revisar: `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to docs/spec-<n>-<slug>`, ajuste e rode o passo 4 de novo.

Leia com a ferramenta **Read**:

- A spec inteira (Produto e Design).
- `docs/product/prd.md` (regras de negócio da capacidade).
- O código do protótipo citado na seção Design: rotas, `src/lib/types/*` e `src/lib/mocks/*`.
- `src/db/schema.ts`, se já existir, e a seção Técnica das outras specs com status `spec`, `dev` ou `done`, para manter o modelo de dados coerente entre stories.
- `AGENTS.md` (regras da versão do Next instalada).

## 1. Desenhar

A arquitetura da esteira (não mude sem registrar em "Decisões"):

- **Next.js 16 App Router** com Cache Components: leitura de dados em server components dentro de `<Suspense>`; escrita por **server actions** (`src/app/<rota>/actions.ts`).
- **Banco:** Drizzle + Postgres. Em dev, testes e CI é o PGlite, em memória; em preview e produção é o Neon. O schema fica em `src/db/schema.ts` e as migrações são geradas por `npm run db:generate`.
- **Regras de negócio** em funções puras de `src/lib/domain/<dominio>.ts` que **recebem o `db` por parâmetro**. É isso que permite testar cada regra com um banco em memória (Vitest).
- **Sem transações**: em produção o banco é o Neon via HTTP, que não tem `db.transaction()` (o banco local também a bloqueia, para os testes pegarem). Operações que precisam ser atômicas viram **um único comando SQL** (ex.: CTE com `DELETE … RETURNING` seguido de `INSERT`). Descreva isso nas Regras de negócio.
- **Valores em dinheiro** em centavos (inteiro). **Datas** em UTC no banco, exibidas em `America/Sao_Paulo`.
- **Mensagens** de erro e validação em PT-BR, no tom do DS.

## 2. Escrever a seção Técnica

Troque o conteúdo de `## Técnica` (o comentário e o `_Pendente._`) por:

```
### Visão geral
<3 a 5 linhas: o que muda no sistema para esta story existir de verdade>

### Modelo de dados
| Tabela | Coluna | Tipo | Regras |
|---|---|---|---|
<marque (nova) ou (existente) em cada tabela; relacionamentos, índices e restrições (únicos, not null, check)>

### Regras de negócio
- `nomeDaFuncao(db, …)` em `src/lib/domain/<dominio>.ts` — <regra> (AC-<n>.<k>)

### Contratos
- **Leitura:** <função de domínio> → <componente/rota>
- **Server action** `nome(input)` → <resultado> · erros: <mensagens>

### Troca dos mocks
| Mock do protótipo | Vira |
|---|---|

### Estados reais
| Estado | Como aparece com dados reais |
|---|---|
| Vazio | <consulta sem resultados> |
| Carregando | <fallback do Suspense> |
| Erro | <error.tsx da rota / mensagem da action> |

### Plano de testes
| AC | Teste de aceite (`e2e/<n>-<slug>.spec.ts`) | Como preparar o "Dado" | Unidade (Vitest) |
|---|---|---|---|
<todo AC tem uma linha. Preparação: pela própria UI (ex.: cadastrar o projeto antes) ou com o relógio do Playwright (page.clock) para tempo **do navegador**. O page.clock NÃO alcança o servidor: regra de tempo calculada no servidor (virada do dia, prazos) é verificada em teste de unidade com horário fixo, e o teste de aceite usa a hora real. O banco é zerado antes de cada teste. Nada de acesso direto ao banco nos testes de aceite.>

### Decisões e riscos
- <decisão> — <motivo>
```

Regras:

- **Todo AC** aparece no Plano de testes.
- Se a story depende de dados de outra story ainda não implementada (ex.: o timer precisa de projetos), defina aqui o **mínimo** dessas tabelas e diga em Decisões como o teste prepara esses dados.
- Sem código de produção. Trechos de código só se uma assinatura precisar ficar inequívoca.
- No frontmatter da spec, troque `status: design` por `status: spec`.

## 3. Conferir

Releia: todo AC tem linha no Plano de testes? Toda regra de negócio aponta para um AC? O modelo de dados é coerente com as outras specs? Se houver lacuna, volte ao passo 2.

## 4. Abrir o gate

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage spec --branch docs/spec-<n>-<slug> --stories <n> --title "docs(spec): #<n> <título da story>" --paths <caminho da spec> --summary "<resumo sem aspas duplas, crases nem $: tabelas novas, regras, quantos ACs no plano de testes>"
```

Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 5. Fechar

Responda curto:

- Tabelas novas e alteradas, regras de negócio e server actions
- Decisões relevantes
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate**, e a story fica `ready-for-dev`. Depois, rode `/esteira:dev <n>`."

Não rode a próxima etapa.
