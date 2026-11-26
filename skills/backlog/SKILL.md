---
name: backlog
description: Terceira etapa da esteira. A partir do PRD aprovado, quebra cada capacidade (CAP-n) em um épico com stories priorizadas e critérios de aceite em Gherkin PT-BR com IDs AC-<issue>.<n>, publica tudo como issues no GitHub (labels type:epic/type:story), gera docs/specs/<issue>-<slug>.md e abre o PR de gate. Use quando a pessoa disser "/esteira:backlog", "quebrar o PRD em stories", "montar o backlog", ou quando o /esteira:status indicar esta etapa.
argument-hint: "[--project <número do GitHub Project> --owner <login>]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/backlog.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/backlog.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Read Write Edit Glob Grep AskUserQuestion
---

# /esteira:backlog

Você transforma o PRD aprovado em backlog: épicos, stories e critérios de aceite executáveis. Você **planeja**, e o script `backlog.mjs` **publica** de forma determinística. Responda sempre em PT-BR.

Argumentos: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

O `sync` volta para o branch padrão e traz o que foi mergeado no GitHub (só se não houver mudanças não commitadas). Se ele responder `blocking: true`, mostre o `reason` e pergunte antes de seguir. Com `synced: false` e `blocking: false` (ex.: não é repo git), siga normalmente.

Se `artifacts.prd.pendingBranch` existir (gate só local, sem GitHub), a pessoa precisa mergear esse branch no padrão antes: diga isso e pare. O backlog não exige o `/esteira:setup`.

- `artifacts.prd.merged` é `false` → o backlog depende do PRD aprovado. Diga isso (rodar `/esteira:prd` ou mergear o PR dele) e **pare**.
- `artifacts.backlog.merged` é `true` → o backlog já está aprovado. Mostre o `next` e pare. Stories novas entram em episódios de feature, não aqui.
- `artifacts.backlog.pendingPr` existe → pergunte se é para revisar o plano existente (`.esteira/backlog.plan.json`) ou parar. Para revisar: rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to docs/backlog`, ajuste o plano e rode os passos 4 e 5 de novo. As issues são reaproveitadas pelo título e o PR é atualizado.
- `github` diferente de `"ok"` → avise que vai rodar em **modo simulado** (`--dry-run`): gera as specs com números provisórios, sem issues. O backlog real exige o repo no GitHub com `gh` logado.

Leia `docs/product/discovery.md` e `docs/product/prd.md` inteiros, com a ferramenta **Read**.

## 1. Planejar

Regras do plano:

- **Um épico por capacidade** `CAP-n` do PRD, na mesma ordem.
- **Stories são fatias verticais**: cada uma entrega algo que dá para demonstrar sozinha, de ponta a ponta. Entre 2 e 6 por épico. Título no imperativo, curto, do ponto de vista da pessoa (ex.: "Iniciar e parar o timer").
- **Ordem = prioridade.** A primeira story do primeiro épico é a próxima a andar na esteira. Comece pelo **esqueleto que anda**: o menor caminho que atravessa o produto.
- **User story** com uma persona do discovery: Como `<persona>`, quero `<ação>`, para `<benefício>`. Os campos `asA`, `iWant` e `soThat` são renderizados exatamente assim, então cada um precisa completar a frase com a gramática certa. Ex.: `soThat` = "que minhas horas fiquem registradas" ou "cobrar com confiança", nunca "minhas horas fiquem registradas".
- **Critérios de aceite em Gherkin PT-BR**, de 2 a 5 por story: caminho feliz, erro relevante e estado vazio quando fizer sentido. Cada critério só tem linhas `Dado`, `Quando`, `Então`, `E`, `Mas`. São comportamentos observáveis, sem detalhes de implementação (nada de "o banco grava", "a API retorna 200").
- `slug` em kebab-case, sem acento, único.
- `outOfScope`: o que a pessoa pode esperar e esta story não entrega.

## 2. Validar com a pessoa (uma rodada)

Mostre uma tabela `Épico | # | Story | ACs` na ordem de prioridade e pergunte numa única rodada (AskUserQuestion quando disponível), com a sua recomendação primeiro:

1. A **ordem de prioridade** está certa? A primeira story é mesmo a primeira?
2. Alguma story está **grande demais** e deve ser dividida, ou deve sair do MVP?

**Sem como perguntar**: siga com o plano como está.

## 3. Escrever o plano

Escreva `.esteira/backlog.plan.json` no repo do produto, exatamente neste formato:

```json
{
  "epics": [
    {
      "cap": "CAP-1",
      "title": "Registrar tempo",
      "description": "Uma ou duas frases sobre o que o épico entrega.",
      "stories": [
        {
          "title": "Iniciar e parar o timer",
          "slug": "timer-start-stop",
          "asA": "freelancer",
          "iWant": "iniciar e parar um timer num projeto",
          "soThat": "que minhas horas fiquem registradas sem esforço",
          "context": "Por que esta story existe e regras de negócio relevantes do PRD.",
          "outOfScope": ["Pausar e retomar o mesmo registro"],
          "acceptance": [
            {
              "title": "Inicia o timer num projeto",
              "gherkin": "Dado que tenho o projeto Site Cliente\nQuando inicio o timer nesse projeto\nEntão vejo o tempo correndo a partir de 00:00:00"
            }
          ]
        }
      ]
    }
  ]
}
```

## 4. Publicar

Rode com a ferramenta **Bash**. Repasse `--project`/`--owner` se vieram em `$ARGUMENTS`, e use `--dry-run` se o GitHub não estiver ok:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/backlog.mjs --plan .esteira/backlog.plan.json
```

- `ok: false` com `errors` → corrija o plano e rode de novo (no máximo 2 tentativas; depois mostre os erros e pare).
- `ok: false` com `error` → mostre e pare. O script é idempotente por título, então rodar de novo depois de corrigir não duplica issues.
- `warnings` → mostre no final (ex.: falta do escopo `project`: `gh auth refresh -s project`).

## 5. Abrir o gate

**Em `--dry-run` não há gate:** os números são simulados e a prévia ficou em `.esteira/specs-preview/`. Pule este passo e diga que o backlog real (issues, `docs/specs/` e PR) precisa do repo no GitHub com `gh` logado.

Fora do dry-run:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage backlog --branch docs/backlog --title "docs(backlog): épicos e stories do MVP" --paths docs/specs --summary "<resumo sem aspas duplas, crases nem $: quantos épicos, stories e ACs, e qual a primeira story>"
```

Leia o JSON: `opened: true` → link. `opened: false` → `reason`. `ok: false` → `error`.

## 6. Fechar

Responda curto:

- Tabela `Épico | Story | ACs` com os números reais das issues (ou "simulado")
- A **primeira story** da fila
- Avisos do script, se houver
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate.** Depois, rode `/esteira:design-system`."

Não rode a próxima etapa.
