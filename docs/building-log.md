# Diário de construção

Registro de decisões, falhas e retrabalhos durante a construção da esteira, fora das câmeras. É a matéria-prima do episódio bônus de making-of.

Formato de cada entrada:

```
## AAAA-MM-DD — <fase> — <título curto>
**O que fiz:** …
**O que deu errado / surpreendeu:** …
**Decisão:** …
**Custo/tempo:** …
```

---

## 2026-11-26 — Design — Sessão de grilling

**O que fiz:** Sessão de perguntas e respostas com o Claude (skill de grilling) para fechar o design da esteira, em 8 rodadas e 36 decisões. O resultado está em [design.md](design.md).

**O que deu errado / surpreendeu:**
- Começamos com a ideia de construir cada skill ao vivo, no mesmo episódio em que ela é usada (Q28). Mudamos para construir tudo fora das câmeras, porque as etapas dependem umas das outras. Exemplos: o formato da spec define quais testes dá para gerar, e as labels do backlog definem a automação do Ep12.
- A ordem das etapas também mudou: o protótipo passou para antes da spec técnica.

**Decisão:** construir a esteira inteira (F0 a F5), fazer um dry-run num produto descartável (F6) e só então gravar.

## 2026-11-26 — F0 — Esqueleto do plugin

**O que fiz:**
- `plugin.json` e `marketplace.json`, no mesmo repo, com `source: "./"`.
- Skill `/esteira:status`. Ela chama `scripts/status.mjs`, um script Node sem dependências que lê os artefatos no branch padrão e as issues e PRs via `gh`, e devolve JSON com o próximo passo.
- 10 testes `node --test` com fixture de `gh` (`ESTEIRA_GH_FIXTURE`).
- O primeiro eval (`evals/status-repo-vazio`).
- CI: testes, `claude plugin validate --strict` e evals rodando em Linux com limite de custo.

**O que deu errado / surpreendeu:**
- **Namespace:** skills de plugin viram `/esteira:<skill>`, não `/discovery`. O design previa `/discovery` e `/esteira`. Ficou `/esteira:discovery`, e o status virou `/esteira:status`.
- **`commands/` é legado:** a documentação recomenda `skills/` para plugins novos.
- **Windows:** no primeiro teste o modelo tentou o PowerShell, foi negado (o `allowed-tools` só liberava Bash) e só depois caiu para o Bash. Corrigi liberando os dois e mandando usar Bash de forma explícita. O `${CLAUDE_PLUGIN_ROOT}` chega com barras normais (`C:/dev/...`), o que funciona.
- **Evals no Windows:** evals que liberam Bash precisam de sandbox do sistema operacional, e o Windows nativo não tem. Esses evals rodam no CI (Linux) ou no WSL2.
- **Custo:** um `/esteira:status` via `claude -p` custou ~US$ 0,31 na minha máquina, inflado pelos vários plugins instalados. No sandbox do eval só o plugin é carregado.

**Decisão:**
- Toda lógica de estado fica em scripts determinísticos testados, e a skill só formata. Isso fica mais barato, testável e previsível para gravar.
- O artefato só conta como feito quando está no branch padrão, ou seja, quando entrou por PR mergeado.

## 2026-11-26 — F1 — Etapas de produto (discovery, PRD, backlog)

**O que fiz:**
- Skills `/esteira:discovery`, `/esteira:prd` e `/esteira:backlog`, e o subagente `esteira:pm`, que pesquisa os concorrentes com fonte.
- Templates de discovery, PRD e spec por story, mais um checklist do revisor por etapa em `templates/gates/`.
- `scripts/gate.mjs`: branch → commit → push → PR, com o checklist da etapa e um marcador `<!-- esteira:gate stage=… stories=… -->`. As automações das próximas fases vão ler esse marcador para aplicar as labels no merge.
- `scripts/backlog.mjs`: valida o plano JSON (CAP-n, slugs, Gherkin), garante as labels, cria épicos e depois stories (ordem = prioridade), reescreve o corpo com os IDs `AC-<issue>.<n>`, põe um checklist no épico, adiciona ao GitHub Project (opcional) e escreve `docs/specs/<issue>-<slug>.md`. É idempotente por título e tem `--dry-run`.
- O status agora reconhece o backlog: as specs no branch padrão ou o PR do backlog aguardando merge.
- 32 testes `node --test` (o `gh` falso registra as chamadas) e 3 evals novos, com `scaffold_script` para semear os arquivos.

**Teste de ponta a ponta** num repo temporário sem GitHub, simulando cada merge:

| Etapa | Custo | Resultado |
|---|---|---|
| discovery | US$ 0,73 | O PM pesquisou Toggl, Clockify e Harvest com URLs reais; 8 premissas; nome "Lida" |
| PRD | US$ 0,54 | 5 capacidades e métricas, sem nenhuma permissão negada |
| backlog (simulado) | US$ 0,83 | Plano válido de primeira: 5 épicos, 20 stories e 52 ACs em Gherkin, com caminho feliz, erro e vazio |

**O que deu errado / surpreendeu:**
- O modelo tentou ler o template com `cat` pelo Bash. Foi bloqueado, porque o plugin fica fora do diretório de trabalho. Agora as skills mandam usar a ferramenta Read.
- A "Ideia original" copiou também a instrução da sessão ("não vou conseguir responder perguntas"). A regra agora é guardar só a ideia.
- As user stories saíram como "para minhas horas fiquem registradas": os campos são renderizados literalmente, então a skill passou a exigir que cada campo complete a frase.
- Evals não aceitam respostas roteirizadas para o AskUserQuestion. Todas as skills ganharam um modo não interativo: seguem com as recomendações e registram as premissas.
- Os issues do backlog são criados **antes** do merge do PR, porque os números das issues entram nos IDs dos ACs. O gate aprova o conteúdo das specs. Se o PR for fechado sem merge, as issues ficam órfãs; tratar isso na F6.
- O `gh` atual não tem o escopo `project`. O GitHub Project fica opcional (`gh auth refresh -s project`).

**Decisão:**
- A IA planeja e o script publica: o plano em JSON é o contrato entre as duas partes.
- A prioridade é a ordem das issues (a primeira story é a próxima a andar). Não criei campo de prioridade.
