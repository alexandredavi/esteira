---
name: deploy
description: Etapa de deploy da esteira. Instala a migração do banco no build da Vercel e o runbook docs/deploy.md, guia a configuração única (Vercel + Neon com branch por preview + ESTEIRA_MIGRATE por ambiente) e mostra o estado dos deploys (produção e preview de cada PR) e como fazer rollback. Use quando a pessoa disser "/esteira:deploy", "configurar o deploy", "como está o deploy", "fazer rollback", ou no episódio de deploy.
argument-hint: "[status | rollback] — padrão: instalar/verificar"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/deploy-status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/deploy-status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) Read Edit Glob Grep
---

# /esteira:deploy

Você deixa o produto publicável: **preview por PR**, **produção na `main`**, migrações automáticas e rollback seguro. A infraestrutura (Vercel e Neon) é configurada **pela pessoa**, nos painéis: você instala o que fica no repo, guia o resto e confere o resultado. Responda sempre em PT-BR.

Pedido: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir`. Para mudar arquivo, use a ferramenta Edit.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## `status` — só mostrar

Rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/deploy-status.mjs` e mostre:

| Ambiente | Estado | URL | Commit |
|---|---|---|---|
| Produção (último deploy) | … | … | … |
| PR #n (preview) | … | … | — |

Mais as `notes`. Pare aqui.

## `rollback` — voltar a versão de produção

O rollback é no painel da Vercel e **é a pessoa que faz**: *Deployments* → o deploy anterior que estava bom → *Instant Rollback*. Você não tem acesso à Vercel e não deve tentar. Mostre o `production` do `deploy-status.mjs` para ela saber de qual commit está voltando e explique:

- As migrações da esteira são **só aditivas**, então o código anterior funciona com o banco novo. Não há rollback de banco.
- A correção definitiva entra por um PR novo, que passa pela esteira.
- **Depois de um Instant Rollback, a Vercel para de promover sozinha** os deploys novos da `main`. Quando a correção for mergeada, a pessoa precisa clicar em **Undo Rollback** (ou *Promote* no deploy novo). Senão a correção não vai para o ar.
- O `production` do `deploy-status.mjs` é o **último** deploy de produção, não necessariamente o que está no ar depois de um rollback.

Pare aqui.

## Padrão — instalar e verificar

### 1. Pré-checagem

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

`artifacts.app.merged` é `false` → falta o `/esteira:setup`. Diga isso e pare. `sync` com `blocking: true` → pergunte.

### 2. Instalar no repo

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs deploy
```

Isso instala `scripts/esteira/migrate.mjs`, muda o `build` para `node scripts/esteira/migrate.mjs && next build` e cria `docs/deploy.md`. No `docs/deploy.md`, troque `{{nome_do_produto}}` pelo nome do produto (do discovery). Confira que nada quebrou: `npm run build`, que localmente só avisa "sem DATABASE_URL: migração pulada" e builda.

Se `changed` não estiver vazio, abra o gate:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage deploy --branch chore/deploy --allow-missing --title "chore(deploy): migração no build da Vercel e runbook" --paths scripts/esteira/migrate.mjs,package.json,docs/deploy.md --summary "<resumo sem aspas duplas, crases nem $>"
```

### 3. Configuração única (a pessoa faz)

Mostre os passos de "Configuração (uma vez)" do `docs/deploy.md`, **numerados e curtos**, e destaque o mais importante:

> `ESTEIRA_MIGRATE=1` no **Preview** só se a integração Neon cria um branch do banco por preview. Senão o build de um PR migraria o banco de **produção**.

Você não cria conta, não conecta integração e não mexe em variável de ambiente. Isso é da pessoa, nos painéis da Vercel e do Neon.

### 4. Verificar

Rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/deploy-status.mjs` e mostre a tabela do modo `status`.

- `vercel: "não conectada"` → a configuração ainda não foi feita. Diga que é só rodar `/esteira:deploy status` depois de importar o repo na Vercel.
- Preview com `state: "failure"` → peça o log do build na Vercel. Se aparecer `[esteira] migração falhou`, o problema é a migração.
- `buildMigrates: false` → o passo 2 não foi mergeado ainda.

### 5. Fechar

Responda curto: o que foi instalado (e o link do PR, se houver), o checklist da configuração com o que já está feito e o que falta, e a tabela dos deploys.

Não rode a próxima etapa.
