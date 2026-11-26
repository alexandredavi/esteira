---
name: design-system
description: Etapa de Design System da esteira. A partir do discovery aprovado, define a identidade visual (cores em tokens oklch claro/escuro, tipografia, raio), aplica no tema do shadcn em globals.css, verifica o contraste WCAG, gera a vitrine /design e docs/design/README.md, e abre o PR de gate. Use quando a pessoa disser "/esteira:design-system", "criar o design system", "definir a identidade visual", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[orientação de marca, opcional — ex.: 'verde, sóbrio, cantos retos']"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/contrast.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Bash(npm run *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/contrast.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(npm run *) Read Write Edit Glob Grep AskUserQuestion
---

# /esteira:design-system

Você define o Design System do produto em cima do shadcn/ui: **só os valores dos tokens mudam**, e a estrutura gerada pelo shadcn fica intacta. O resultado é aprovado por **um PR**. Responda sempre em PT-BR.

Orientação de marca: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

- `sync` com `blocking: true` → mostre o `reason` e pergunte antes de seguir.
- `artifacts.app.merged` é `false` → falta o app. Mostre o `next` (`/esteira:setup`) e **pare**.
- `artifacts.discovery.merged` é `false` → a identidade depende do discovery. Mostre o `next` e pare.
- `artifacts.designSystem.merged` é `true` → já aprovado. Mostre o `next` e pare.
- `artifacts.designSystem.pendingPr` → pergunte se é para revisar. Para revisar: `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to design/system`, ajuste e rode o passo 6 de novo.

Leia com a ferramenta **Read**: `docs/product/discovery.md`, `components.json` (o campo `tailwind.css` diz onde está o `globals.css`, normalmente `src/app/globals.css`), o próprio `globals.css` e `src/app/layout.tsx`. Liste `src/components/ui/`.

## 1. Proposta (uma rodada)

A partir da persona, do problema, da proposta de valor e do nome no discovery, monte uma proposta com:

1. **Personalidade**: 3 adjetivos, com uma frase cada.
2. **Cor primária**: 3 opções, cada uma com nome, valor `oklch(L C H)` e o porquê. Recomende uma.
3. **Tipografia**: 2 opções de família do Google Fonts (via `next/font/google`), legíveis em PT-BR e com números tabulares. Recomende uma. Uma família só é o padrão; uma segunda família para títulos é opcional.
4. **Raio** (`--radius`): 0.375rem (sóbrio), 0.625rem (padrão) ou 0.875rem (amigável).
5. **Densidade**: compacta ou confortável.

Faça **uma única rodada** com AskUserQuestion, com a sua recomendação primeiro, para que "sim" aceite tudo. **Sem como perguntar**: siga com as recomendações e registre isso na seção Identidade do README.

## 2. Tokens

Edite **só os valores** das variáveis em `:root` e `.dark` no `globals.css`. Não renomeie, não remova e não mexa em `@theme inline` (salvo a fonte de títulos, abaixo).

- Derive do primário: `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring` e `--chart-1…5` (uma rampa do primário ou cores análogas, com luminosidades bem distintas).
- Neutros (`--background`, `--foreground`, `--card`, `--muted`, `--border`…): pode puxar um pouco o matiz do primário (croma ≤ 0.02) para dar personalidade.
- No `.dark`, ajuste o primário para ficar legível num fundo escuro (L mais alto) e inverta os `-foreground`.
- Mantenha `oklch(...)`. Cores com alfa (`/ 10%`) só em `--border`, `--input` e `--sidebar-border` do escuro, como o shadcn já faz.

## 3. Contraste (obrigatório)

Rode:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/contrast.mjs
```

`ok: false` → ajuste os tokens dos pares em `failures` (normalmente escurecendo o `-foreground` ou o fundo) e rode de novo, até `ok: true`. **Não abra o gate com contraste reprovado.** Atenção: o tema padrão do shadcn já reprova `muted-foreground` sobre `muted` no claro (4.33:1).

## 4. Fonte, idioma e metadados

Em `src/app/layout.tsx`:

- Troque a fonte pela escolhida, via `next/font/google`, com `variable: "--font-sans"` (e `subsets: ["latin"]`).
- Fonte de títulos diferente (opcional): carregue a segunda família com `variable: "--font-display"`, aplique as duas variáveis no `<html>` e, no `@theme inline` do `globals.css`, troque `--font-heading: var(--font-sans);` por `--font-heading: var(--font-display);`.
- `lang="pt-BR"`. Em `metadata`, `title` é o nome do produto e `description` é a proposta de valor em uma frase.

## 5. Vitrine e documentação

1. Leia `${CLAUDE_PLUGIN_ROOT}/templates/app/design-page.tsx` com **Read** e escreva em `src/app/design/page.tsx`, trocando `{{nome_do_produto}}`. Não acrescente estilos crus.
2. Leia `${CLAUDE_PLUGIN_ROOT}/templates/design-system.md` com **Read** e escreva `docs/design/README.md`: preencha todas as seções, troque os `{{…}}`, **remova os comentários `<!-- -->`** e copie a tabela de contraste do passo 3.

Verifique com a ferramenta **Bash**:

```
npm run lint
npm run typecheck
npm run build
```

Os três precisam passar.

## 6. Abrir o gate

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage design-system --branch design/system --title "chore(design): Design System do <Nome>" --paths <globals.css>,src/app/layout.tsx,src/app/design,docs/design --summary "<resumo sem aspas duplas, crases nem $: personalidade, primária, fonte, raio e contraste aprovado>"
```

`<globals.css>` é o caminho do `components.json` (ex.: `src/app/globals.css`). Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 7. Fechar

Responda curto:

- Personalidade (3 adjetivos), primária (nome e oklch), fonte e raio
- Contraste: menor razão no claro e no escuro
- Como ver: a rota `/design` no preview do PR ou em `npm run dev`
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate.** Depois, rode `/esteira:prototipo`."

Não rode a próxima etapa.
