---
name: testes
description: Etapa de testes de aceite da esteira. Para uma story implementada (PR de dev aberto), transforma cada critério de aceite Gherkin em um teste Playwright com o ID AC-<issue>.<n> no título, roda os testes e a rastreabilidade até ficarem verdes e atualiza o mesmo PR. Use quando a pessoa disser "/esteira:testes", "escrever os testes de aceite da story #N", "o CI está vermelho na rastreabilidade", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número da story — padrão: a que está em review]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) Bash(npx playwright install chromium) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) PowerShell(npx playwright install chromium) Bash(git rm *) PowerShell(git rm *) Read Write Edit Glob Grep
---

# /esteira:testes

Você transforma os critérios de aceite da story em **testes executáveis**: um teste Playwright por `AC-<n>.<k>`, com o ID no título. A spec vira teste, e a rastreabilidade no CI garante que nenhum critério fica sem teste. Responda sempre em PT-BR.

Story pedida: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento. Para apagar um arquivo, use `git rm <caminho>`: é o único comando de remoção liberado (`rm` e `Remove-Item` pedem aprovação).

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

1. Rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .` com a ferramenta **Bash**. A story é o número em `$ARGUMENTS`, ou a story em `in-review` em `stories[]`.
2. Vá para o branch do PR de dev: `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to feat/<n>-<slug>`.
   - `ok: false` (o branch não existe) → a story ainda não foi implementada. Diga para rodar `/esteira:dev <n>` e pare.
   - `blocking: true` → mostre o `reason` e pergunte.
3. No branch, a spec precisa ter `status: dev`. Se não tiver, o dev não terminou: pare e explique.
4. `node ${CLAUDE_PLUGIN_ROOT}/scripts/ensure.mjs tests`, que é idempotente e garante Playwright e rastreabilidade.

Leia com a ferramenta **Read**: a spec inteira (os ACs em Gherkin e o **Plano de testes** da Técnica), `e2e/support.ts` e o código das telas da story, para conhecer os textos, rótulos e papéis usados nos seletores.

## 1. Escrever `e2e/<n>-<slug>.spec.ts`

```ts
import { test, expect } from "./support"; // banco zerado antes de cada teste

test("AC-<n>.1 — <título do AC, igual ao da spec>", async ({ page }) => {
  // Dado <passo>
  …
  // Quando <passo>
  …
  // Então <passo>
  await expect(…).toBeVisible();
});
```

Regras:

- **Um `test(...)` por AC**, com o ID e o título exatos da spec. `test.skip` e `test.fixme` **não contam** na rastreabilidade.
- Cada passo Gherkin vira um comentário seguido do código que o executa. O teste diz o que o critério diz, sem verificar a mais nem a menos.
- **Seletores acessíveis**: `getByRole`, `getByLabel`, `getByText`. `data-testid` só em último caso, e aí acrescente o atributo no componente.
- **"Dado" pela UI**: crie os dados pela própria interface, como o Plano de testes manda. Para tempo **no navegador**, use o relógio do Playwright (`await page.clock.install()`, `page.clock.fastForward("45:00")`). Ele **não** muda a hora do servidor: se o critério depende de tempo calculado no servidor, o teste de aceite usa a hora real (e calcula o esperado no próprio teste), e a regra fica coberta pelos testes de unidade, como o Plano de testes manda. Sem acesso direto ao banco.
- Sem `waitForTimeout`: espere por estado visível (`expect(...).toBeVisible()`).

## 2. Rodar até ficar verde

Rode com a ferramenta **Bash** (o primeiro `install` baixa o Chromium; timeout de 600000 ms):

```
npx playwright install chromium
npm run test:e2e
npm run trace
```

- **Teste falhou porque o app não cumpre o AC** → é bug da implementação. Corrija o código do app (o mesmo PR) e registre a correção para o resumo.
- **Teste falhou por causa do teste** (seletor ou tempo) → corrija o teste.
- `npm run trace` precisa terminar com `OK`.

Depois, confirme que nada quebrou: `npm run lint`, `npm run typecheck`, `npm run test`.

## 3. Atualizar o PR

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage dev --branch feat/<n>-<slug> --closes <n> --allow-missing --title "feat(#<n>): <título da story>" --paths e2e,src,scripts,playwright.config.ts,package.json,package-lock.json,.github,.gitignore --summary "<resumo sem aspas duplas, crases nem $>"
```

O gate faz o commit no mesmo branch e o push. O PR já existe, então ele só é atualizado (`existed: true`).

## 4. Fechar

Responda curto:

- Tabela `AC | teste | resultado`
- Bugs da implementação achados e corrigidos pelos testes, se houver
- Rastreabilidade: `OK`
- Link do PR e: "O CI deve ficar verde. Depois, rode `/esteira:review <PR>`."

Não rode a próxima etapa.
