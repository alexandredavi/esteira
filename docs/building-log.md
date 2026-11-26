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

**Revisão independente do PR #1** (um subagente sem contexto da escrita) achou 8 bugs que os 32 testes não pegavam:

| # | Gravidade | Bug | Correção |
|---|---|---|---|
| 1 | Alta | O status comparava com a `main` local, que não muda depois do merge no GitHub. Resultado: mandava refazer o discovery já aprovado | `git fetch` + comparar com `origin/<padrão>`; branch de gate só local vira "mergeie o branch"; `sync.mjs` volta para o padrão atualizado no início de cada etapa |
| 2 | Alta | `outOfScope` em texto passava na validação e quebrava **depois** de criar as issues | Validação de tipos em todos os níveis e try/catch que sempre devolve JSON |
| 3 | Alta | A busca por título reaproveitava qualquer issue (até um bug antigo) e sobrescrevia o corpo dela | Só reaproveita issues com a label `type:epic` ou `type:story`; falha na listagem vira erro |
| 4 | Média | Títulos de story duplicados passavam | São rejeitados |
| 5 | Média | Revisar um gate a partir da `main` falhava no `git switch` | O gate guarda o conteúdo, faz stash, troca de branch e reaplica; `sync --to <branch>` |
| 6 | Média | O gate commitava tudo o que estava no stage (um `segredo.txt` entrou no commit) | `git commit -- <paths>` |
| 7 | Média | O dry-run escrevia specs com números falsos em `docs/specs` | A prévia vai para `.esteira/specs-preview/`, sem gate; specs antigas do mesmo slug são substituídas |
| 8 | Baixa | `Dada`, `Dados` e `Dadas` eram rejeitados | Aceitos |

Agora são 46 testes, com um teste de regressão por achado.

**Lição para o vídeo:** os testes que eu mesmo escrevi confirmavam o que eu tinha pensado, não o que podia dar errado. A revisão sem contexto achou o bug mais grave (o #1) só lendo o código.

**Decisão:**
- A IA planeja e o script publica: o plano em JSON é o contrato entre as duas partes.
- A prioridade é a ordem das issues (a primeira story é a próxima a andar). Não criei campo de prioridade.

## 2026-11-26 — F2 — Setup do app, Design System e protótipo

**O que fiz:**
- Antes de escrever o setup, gerei um app de teste com `create-next-app` e shadcn para ver o formato real, em vez de supor. O app fica em `src/`, o shadcn usa o preset `base-nova` com tokens `oklch` e o ESLint usa flat config com `defineConfig`.
- `/esteira:setup` (`setup.mjs`): o Next.js 16.4.6 é gerado num diretório temporário (o `create-next-app` recusa diretórios com arquivos que não conhece) e mesclado no repo **sem sobrescrever** README nem `docs/`. Depois vêm shadcn 4.23.1 com 16 componentes, a regra de lint do DS e os workflows `ci.yml` e `esteira-gates.yml`. Leva uns 90 s.
- Regra `esteira-ds/no-raw-styles`: barra a paleta crua (`bg-red-500`, `text-white`), valores arbitrários de cor, espaçamento, fonte e raio, e cor em `style={{}}`. Testada com nós de AST e no ESLint real com violações plantadas. Os primitivos em `src/components/ui` ficam de fora, porque o próprio shadcn usa `text-[0.8rem]` e `rounded-[min(...)]`.
- `contrast.mjs`: converte OKLCH para sRGB e mede o contraste WCAG dos pares de texto nos temas claro e escuro.
- `/esteira:design-system`: só os valores dos tokens mudam, a estrutura do shadcn fica. Inclui contraste obrigatório, vitrine `/design` com claro e escuro lado a lado, e `docs/design/README.md`.
- `/esteira:prototipo`: telas no próprio app, com mocks tipados e estados por `?estado=`, mapa `AC → onde ver` na seção Design da spec, e o PR com o marcador `stories=`. O workflow `esteira-gates` aplica `design:approved` no merge.
- O status ganhou o app como primeiro artefato (Ep0) e os estágios `design-review` e `spec-review`, lidos do marcador nos PRs abertos.
- Os evals da F2 semeiam um app mínimo. Os `seed.sh` são gerados a partir de uma fonte única, e o `npm test` falha se ficarem desatualizados. São 72 testes.

**Teste de ponta a ponta** (repo temporário, merges simulados):

| Etapa | Tempo | Custo | Resultado |
|---|---|---|---|
| setup | 86 s | — (script) | README e docs preservados; lint e build ok |
| design system | 118 s | US$ 0,95 | Verde-petróleo `oklch(0.5 0.11 170)`, Inter, todos os pares AA (menor: 5,35:1) |
| protótipo #10 | 154 s | US$ 1,16 | `/timer` funcional em memória, 4 de 4 ACs mapeados, estado extra `?estado=rodando` para o AC-10.2 |

Conferi as telas no navegador: o timer conta de verdade, e a vitrine mostra os dois temas.

**O que deu errado / surpreendeu:**
- **O tema padrão do shadcn reprova no WCAG AA:** `muted-foreground` sobre `muted` no claro dá 4,33:1 (mínimo 4,5). O meu teste supunha o contrário, e o script estava certo.
- **O build quebrou com lint e tipos verdes.** O template do Next 16 liga `cacheComponents: true`, e aí ler `searchParams` fora de `<Suspense>` quebra o prerender. A skill agora ensina o padrão (página estática + conteúdo dinâmico em `<Suspense>`) e roda `npm run build` na verificação.
- O `typecheck` falhava antes do primeiro build, porque `LayoutProps` é gerado pelo Next. Virou `next typegen && tsc --noEmit`.
- A regra do DS reportava cada erro **duas vezes** no ESLint real (`className={cn(...)}` visitado duas vezes). O teste com AST mínimo não pegava; o ESLint real pegou.
- O modelo montou comandos com `cd … &&` e `mkdir`, que pedem aprovação. As skills agora dizem: um comando por vez, sem `cd`, e a ferramenta Write cria as pastas.
- **Armadilhas do Windows para mim, não para a esteira:**
  - O pipe do PowerShell 5.1 corrompe UTF-8 ("â€”") e o `Set-Content` põe BOM, o que quebrou o `package.json` do repo de teste.
  - O `bash` do PATH é o do WSL, que está quebrado; o Git Bash funciona.
  - Regra que vale para o vídeo: arquivos sempre escritos via Node ou Write, nunca via pipe do PowerShell.

**Decisão:**
- O protótipo é feito por story por padrão (aceita várias num PR).
- A primeira chamada de `/esteira:status` num repo vazio sugere `/esteira:setup` (Ep0).
- As versões de `create-next-app` e `shadcn` ficam fixadas no script, para que quem assiste reproduza exatamente o que aparece no vídeo.

**Revisão independente do commit da F2** (mesmo processo da F1). Achou 7 problemas, todos corrigidos com teste de regressão:

| # | Gravidade | Bug | Correção |
|---|---|---|---|
| 1 | Alta | Ao colocar o setup como primeira etapa, quebrei o eval `status-repo-vazio`, e as skills de produto podiam travar esperando o setup | O eval espera `/esteira:setup`; cada skill cita a etapa anterior exata, e o discovery não depende do app |
| 2 | Alta | Se o `npm install` ou o shadcn falhassem depois da mescla, rodar de novo dava "já montado" e o repo ficava pela metade, sem gate | O setup é retomável: completa só o que falta (`missingParts`), devolve os `paths` mesmo na falha e sempre apaga o diretório temporário; `package.json` que não é de Next vira erro |
| 3 | Média | O gate do protótipo deixava de fora o `package.json` e o lockfile quando um `shadcn add` instalava dependências, e o `npm ci` do CI quebrava | Esses arquivos e o `components.json` entram sempre nos `paths` do gate |
| 4 | Média | A regra do DS barrava valores que não são cor: `stroke-[1.5]` (ícones lucide), `border-[2px]`, `to-[50%]` | Só barra o colchete quando o conteúdo é cor (`#`, `rgb(`, `oklch(`, `var(--`…) |
| 5 | Média | A regra deixava passar `bg-red-500/[.3]`, `border-s-*`, `text-shadow-red-500` e cores dentro de `${}` em template literal | Modificador de opacidade completo, utilidades novas, expressões do template e wrappers de TS (`as`, `satisfies`) |
| 6 | Média | O contraste se perdia com comentário antes do `:root`, com lista de seletores e com vários blocos, e arredondava 4,495 para 4,5 (passava) | Parser por blocos que mescla tudo, ignora comentários e at-rules; compara o valor exato e reporta truncado (o padrão do shadcn vira 4,33:1) |
| 7 | Baixa | Um PR de revisão do protótipo aberto ficava escondido pela label `design:approved`; com dois gates abertos, o último PR vencia | Um gate aberto vence a label; o gate de spec vence o de protótipo |

**De novo:** os testes que eu escrevi passavam todos, e a revisão sem contexto achou 3 problemas graves. Virou regra: **toda fase termina com uma revisão independente antes do PR.**

**E o PC reiniciou no meio das correções.** Nada se perdeu: o trabalho estava no disco, no branch `feat/f2-design`, e o diário e os testes mostraram exatamente onde parei.

**Mais uma depois da revisão:** o setup real, rodado de novo para validar as correções, **quebrou o build** com `Can't resolve '...'`. O Tailwind v4 varre todo o projeto atrás de classes, inclusive a regra de lint. Um **comentário** com o exemplo `bg-[url` + `(...)]` virou CSS com `url(...)`, e o Turbopack tentou resolver o arquivo "...". Corrigi o comentário e criei um teste que impede `[url(` no arquivo da regra. Moral: o teste de ponta a ponta de verdade (setup → lint → build) pega o que nenhum teste unitário e nenhuma revisão pegaram.
