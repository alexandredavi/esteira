---
name: prototipo
description: Etapa de protótipo da esteira. Para uma ou mais stories do backlog, constrói telas navegáveis no próprio app (Next.js + componentes e tokens do Design System), com dados mock e os estados vazio/carregando/erro, mapeia cada critério de aceite para onde ele aparece, preenche a seção Design da spec e abre o PR de gate (o merge aplica design:approved). Use quando a pessoa disser "/esteira:prototipo", "prototipar a story #N", "fazer as telas", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[número(s) da(s) story(ies) — padrão: a próxima do backlog]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) Bash(npx shadcn@4.23.1 add *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) PowerShell(npx shadcn@4.23.1 add *) Bash(git rm *) PowerShell(git rm *) Read Write Edit Glob Grep AskUserQuestion
---

# /esteira:prototipo

Você prototipa a experiência de uma story **no próprio app**, em código real, com o Design System e com **dados mock**. Este protótipo é o começo do produto: o `/esteira:dev` depois troca os mocks por dados de verdade. Responda sempre em PT-BR.

Stories pedidas: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento. Para apagar um arquivo, use `git rm <caminho>`: é o único comando de remoção liberado (`rm` e `Remove-Item` pedem aprovação).

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `sync` com `blocking: true` → mostre o `reason` e pergunte antes de seguir.
- `artifacts.designSystem.merged` é `false` → o protótipo depende do DS aprovado. Mostre o `next` e **pare**.
- Escolha das stories: os números de `$ARGUMENTS`, ou a primeira story com `stage: "backlog"` em `stories[]`.
  - Story com `stage: "design-review"` → já há um PR de protótipo aberto. Pergunte se é para revisar. Para revisar: `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to design/<n>-<slug>`, ajuste e rode o passo 6 de novo.
  - Story num estágio além de `design-review` → já passou desta etapa. Diga isso e pare.

Leia com a ferramenta **Read**:

- A spec da story: `docs/specs/<n>-<slug>.md`. Sem GitHub, a prévia simulada fica em `.esteira/specs-preview/`; avise que é simulada.
- `docs/design/README.md` (regras e componentes do DS) e `docs/product/discovery.md` (persona e tom de voz).
- `src/components/ui/` (o que já existe) e `src/app/` (rotas e o shell que já existem, para reaproveitar).

## 1. Plano de telas

Antes de escrever código, monte e mostre:

- **Rotas**: rotas reais do app (ex.: `src/app/(app)/timer/page.tsx`). Reaproveite as que já existem.
- **Mapa de critérios**: para cada `AC-<n>.<k>`, onde e como ver no protótipo (rota + estado + ação). **Todo AC precisa aparecer.**
- **Estados**: `padrao`, `vazio`, `carregando` e `erro`, escolhidos pela URL com `?estado=<nome>`, para a pessoa revisora ver cada um no preview.
- **Componentes**: os do DS que vai usar e os que faltam. Para os que faltam do catálogo do shadcn, use `npx shadcn@4.23.1 add <nome> -y`. Componente próprio só se nenhuma combinação servir, e isso precisa ser justificado.

Interativo: confirme o plano numa rodada rápida (AskUserQuestion). Sem como perguntar: siga.

## 2. Construir

Regras do código:

- **Shell do app**: se ainda não existir, crie `src/components/app-shell.tsx` (cabeçalho com o nome do produto e navegação para as rotas prototipadas) e um layout de grupo `src/app/(app)/layout.tsx` que o usa.
- **Tipos** do domínio em `src/lib/types/<dominio>.ts`. **Mocks** tipados em `src/lib/mocks/<dominio>.ts`, com dados realistas em PT-BR (nomes, valores em R$, datas dd/mm). Nenhuma chamada a API ou banco.
- **Estados**: o estado vem de `?estado=` em `searchParams`. Carregando = `Skeleton`. Erro = `Alert variant="destructive"` com uma ação de tentar de novo. Vazio = mensagem e um próximo passo claro.
- **Next 16 com Cache Components** (`cacheComponents: true` no `next.config.ts`): dado de runtime (`searchParams`, `cookies()`, `headers()`) **só dentro de um componente envolvido em `<Suspense>`**. Senão o `build` quebra ("uncached or runtime data during prerendering"), mesmo com lint e typecheck passando. Padrão:

  ```tsx
  export default function Page({ searchParams }: PageProps<"/timer">) {
    return (
      <>
        <h1>…</h1>{/* parte estática */}
        <Suspense fallback={<Carregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </>
    );
  }
  async function Conteudo({ searchParams }: Pick<PageProps<"/timer">, "searchParams">) {
    const { estado } = await searchParams;
    …
  }
  ```

  Leia também o `AGENTS.md` do repo: o Next 16 traz ali regras próprias da versão instalada.
- **Interação** em client components (`"use client"`) com estado local (`useState`): o protótipo precisa *funcionar* (ex.: iniciar e parar o timer de verdade), só que em memória.
- **DS**: só tokens semânticos. A regra `esteira-ds/no-raw-styles` reprova a paleta crua, valores arbitrários de cor, espaçamento, fonte e raio, e cor em `style`. Números de horas e valores levam `tabular-nums`.
- **Texto** em PT-BR, no tom de voz do DS. Acessível: `Label` em todo campo, botões com texto ou `aria-label`.

## 3. Verificar

Rode com a ferramenta **Bash**:

```
npm run lint
npm run typecheck
npm run build
```

Os três precisam passar. O `build` pega o que lint e tipos não pegam, como dado de runtime fora de `<Suspense>`. Corrija e rode de novo. Não desligue a regra do DS nem use `eslint-disable`.

## 4. Preencher a seção Design da spec

Na spec da story, troque o conteúdo de `## Design` (o comentário e o `_Pendente._`) por:

```
### Rotas
- `/timer` — <o que tem>

### Como ver cada critério
| AC | Onde | Como |
|---|---|---|
| AC-<n>.1 | `/timer` | Clique em Iniciar… |

### Estados
| Estado | URL |
|---|---|
| Vazio | `/timer?estado=vazio` |

### Componentes do DS
<lista>. Novos: <nenhum, ou o componente e o motivo>.

### Mocks
`src/lib/mocks/<dominio>.ts` — <o que simulam>. O /esteira:dev troca por dados reais.
```

Não mexa nas seções Produto e Técnica. No frontmatter da spec, troque `status: backlog` por `status: design` (acrescente a linha se ela não existir): é como o git registra que o protótipo foi aprovado quando o PR é mergeado.

## 5. Conferir a cobertura

Releia o mapa: todo `AC-<n>.<k>` da seção Produto tem uma linha em "Como ver cada critério"? Se faltar algum, volte ao passo 2.

## 6. Abrir o gate

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage prototipo --branch design/<n>-<slug> --stories <n>[,<m>] --title "chore(prototipo): #<n> <título da story>" --paths src,<caminho da spec>,package.json,package-lock.json,components.json --summary "<resumo sem aspas duplas, crases nem $: rotas, quantos ACs cobertos, estados>"
```

`package.json`, `package-lock.json` e `components.json` vão sempre: um `npx shadcn add` pode instalar dependências, e sem elas o `npm ci` do CI e da Vercel quebra. Se nada mudou neles, o gate não os inclui no commit. Com várias stories, use a primeira no nome do branch e todas em `--stories`. Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 7. Fechar

Responda curto:

- Rotas criadas e o mapa `AC → onde ver`
- Links de estado (`?estado=vazio` etc.)
- Link do PR e: "Abra o **preview** do PR (o comentário da Vercel aparece em 1 a 2 minutos) ou rode `npm run dev`. **Revise e mergeie. O merge é o gate**, e a story recebe `design:approved`. Depois, rode `/esteira:spec`."

Não rode a próxima etapa.
