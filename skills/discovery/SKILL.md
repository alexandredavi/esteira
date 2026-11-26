---
name: discovery
description: Primeira etapa da esteira. Transforma uma ideia bruta de produto em docs/product/discovery.md (problema, personas, jobs to be done, concorrentes com fonte, proposta de valor, nome, premissas) e abre o PR de gate. Use quando a pessoa disser "/esteira:discovery", "tenho uma ideia de produto", "vamos fazer o discovery", ou quando o /esteira:status indicar esta etapa.
argument-hint: "<ideia do produto em uma ou duas frases>"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs *) PowerShell(node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs *) Read Write Edit Glob Grep WebSearch WebFetch AskUserQuestion
---

# /esteira:discovery

Você conduz o discovery de um produto novo. O resultado é **um arquivo** (`docs/product/discovery.md`) aprovado por **um PR**. Responda sempre em PT-BR.

Ideia recebida: `$ARGUMENTS`

> **Execução:** rode cada comando sozinho, a partir do diretório atual do repo: sem `cd`, `&&`, `;` ou `mkdir` (a ferramenta Write já cria as pastas). Comandos compostos pedem aprovação e travam a etapa. Para mudar arquivo, use a ferramenta Edit ou Write, nunca `sed`, `awk` ou redirecionamento.

> **Nunca edite os arquivos do plugin** (tudo em `${CLAUDE_PLUGIN_ROOT}`: scripts, templates e skills). Se um script da esteira falhar, mostre o erro e pare: quem corrige o plugin é quem o mantém, não a etapa.

## 0. Pré-checagem

Rode com a ferramenta **Bash**, nesta ordem:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs .
node ${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs .
```

O `sync` volta para o branch padrão e traz o que foi mergeado no GitHub (só se não houver mudanças não commitadas). Se ele responder `blocking: true`, mostre o `reason` e pergunte antes de seguir. Com `synced: false` e `blocking: false` (ex.: não é repo git), siga normalmente.

O discovery **não depende de nenhuma etapa anterior**, nem do `/esteira:setup`: ele pode vir antes do app. Se o `next` do status apontar para outra etapa (ex.: `/esteira:setup`), ignore e siga.

- `artifacts.discovery.merged` é `true` → o discovery já está aprovado. Diga isso, mostre o `next` e **pare**.
- `artifacts.discovery.pendingPr` existe → já há um PR aguardando merge. Mostre o link e pergunte se a pessoa quer **revisar o arquivo existente**. Se sim, rode `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync.mjs . --to docs/discovery` para voltar ao branch do PR, edite o arquivo e rode o passo 5 de novo, que atualiza o mesmo PR. Se não, pare.
- Se `$ARGUMENTS` estiver vazio, peça a ideia em uma ou duas frases e espere.

## 1. Entrevista (uma rodada)

Faça **uma única rodada** de até 5 perguntas, cada uma com a sua recomendação, para que "sim" aceite a recomendação. Use AskUserQuestion quando disponível. Pergunte só o que a ideia não responde:

1. **Persona principal**: quem sente a dor com mais intensidade?
2. **Situação**: em que momento a dor aparece? O que dispara o problema?
3. **Como resolve hoje**: ferramenta, gambiarra ou nada?
4. **Ambição**: nicho específico ou categoria ampla? Mercado BR, global?
5. **Restrições** conhecidas: idioma, dispositivo, regulação, orçamento.

**Sem como perguntar** (modo não interativo, ou a ferramenta falhou): **não pare**. Siga com as respostas recomendadas e registre cada uma como premissa na seção 8 do arquivo, com um jeito de validar.

## 2. Concorrentes e alternativas

Faça a pesquisa **você mesmo, neste turno**, seguindo as regras do PM da esteira em `${CLAUDE_PLUGIN_ROOT}/agents/pm.md` (leia com a ferramenta Read): de 4 a 7 alternativas, pelo menos uma não-software, confirmadas com WebSearch/WebFetch, nunca invente URL e marque com `conhecimento do modelo — validar` o que não confirmou. Não delegue a um subagente: o resultado dele chegaria num turno seguinte, sem as permissões desta skill.

## 3. Nome

Proponha **5 nomes próprios** curtos (de preferência até 2 sílabas e fáceis de falar em PT-BR), com "por que sim" e "por que não" para cada um. Evite marcas existentes da categoria e nomes descritivos genéricos.

- Interativo: a pessoa escolhe (AskUserQuestion, com a sua recomendação primeiro).
- Não interativo: escolha o melhor e registre como premissa.

## 4. Escrever o artefato

Leia o template `${CLAUDE_PLUGIN_ROOT}/templates/discovery.md` com a ferramenta **Read** (não use `cat`: o plugin fica fora do diretório de trabalho). Escreva `docs/product/discovery.md` no repo do produto, criando as pastas se preciso:

- Preencha **todas** as seções. Troque os `{{…}}` e **remova os comentários `<!-- -->`**.
- Ideia original: só a ideia de produto, literal. Deixe de fora instruções sobre a sessão (ex.: "não vou conseguir responder perguntas").
- Problema: sem falar de solução.
- Jobs to be done no formato "Quando…, quero…, para…".
- Proposta de valor no formato do template.
- Tudo o que foi presumido vai em "Premissas e hipóteses".

Conteúdo enxuto: o arquivo inteiro deve caber em ~2 telas.

## 5. Abrir o gate

Rode com a ferramenta **Bash**, com um resumo de 2 a 4 frases **sem aspas duplas, crases nem `$`**:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/gate.mjs --stage discovery --branch docs/discovery --title "docs(discovery): <Nome> — discovery do produto" --paths docs/product/discovery.md --summary "<resumo>"
```

O script cria o branch, faz commit, push e abre o PR com o checklist do revisor. Ele devolve JSON:

- `opened: true` → mostre o link do PR.
- `opened: false` → mostre o `reason`. O arquivo foi salvo e o PR fica para quando o repo estiver no GitHub.
- `ok: false` → mostre o `error` e pare.

## 6. Fechar

Responda curto:

- **Nome escolhido** e a **proposta de valor** (uma frase)
- Personas (uma linha cada)
- Quantas premissas ficaram para validar
- Link do PR e: "**Revise e mergeie o PR. O merge é o gate.** Depois, rode `/esteira:prd`."

Não rode a próxima etapa.
