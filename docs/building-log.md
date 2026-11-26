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

## 2026-11-26 — F3 — Spec técnica, dev e testes de aceite

**O que fiz:**
- Antes de escrever template, validei a base num app de prova: Drizzle + **PGlite** (Postgres em processo) dentro do servidor Next 16 em build de produção, uma server action, Vitest com banco em memória e Playwright com o banco zerado entre os testes. Só então virou template.
- `ensure.mjs db|tests`: instala no produto, de forma idempotente, a camada de dados e a de testes:
  - `getDb()` usa o Neon quando existe `DATABASE_URL`; sem ela usa PGlite, que serve para dev, testes e CI sem infraestrutura nenhuma;
  - Vitest, Playwright e a rota `/api/e2e/reset`, que só existe com `E2E=1`;
  - o CI v2, com atualização automática do v1.
- `traceability.mjs`, que vai para o produto: todo AC de spec com `status: dev|done` precisa de um teste com o ID no título. `test.skip` não conta.
- Estado da story **no git**: o `status` no frontmatter da spec (backlog → design → spec → dev → done) é atualizado por cada etapa e aprovado junto com o PR. Funciona sem GitHub.
- Skills `/esteira:spec`, `/esteira:dev` e `/esteira:testes`. O gate ganhou `--closes` e `--allow-missing`. O status passou a sugerir `/esteira:testes` antes do `/esteira:review` quando o branch do PR não tem teste de aceite.

**Teste de ponta a ponta da story #10** (timer), num repo local:

| Etapa | Tempo | Custo | Resultado |
|---|---|---|---|
| spec | 99 s | US$ 0,77 | 4 tabelas, regras, 3 actions e plano de testes com casos de fronteira (59.999 ms contra 60.000 ms, 23h30 em São Paulo) |
| dev (2 rodadas) | 460 s | US$ 2,60 | 26 testes de unidade, migração, `/timer` com dados reais; a rastreabilidade **reprova** (0/4), como planejado |
| testes | 139 s | US$ 0,87 | 4/4 ACs com teste Playwright passando; rastreabilidade OK |

**O que deu errado / surpreendeu:**
- **O Vitest 5 exige `@types/node` 22 ou mais, e o template do Next traz a versão 20.** O `npm install` quebrou com ERESOLVE. O `ensure tests` agora atualiza para a versão 24.
- **A rota de reset não compilava com tabelas reais** (type predicate do Drizzle). O build quebrou e o Playwright ficou sem servidor. O app de prova pegou isso antes de virar problema de quem assiste.
- **A skill de dev não podia apagar arquivo.** A Técnica mandava remover o mock e `git rm`, `rm` e `Remove-Item` foram todos negados, então a skill parou e pediu aprovação. Agora as skills de código liberam `git rm` e dizem que ele é o caminho.
- A skill de testes tentou corrigir o teste com `sed`, que pede aprovação. As skills agora dizem para editar só com Edit/Write.
- **O modelo leu a documentação do Next dentro do `node_modules`** (graças ao `AGENTS.md`). Usou `retry()` no `error.tsx`, que é a recomendação da versão instalada, e percebeu que o driver HTTP do Neon não tem transação: resolveu parar o timer e gravar o registro num único comando SQL atômico. Os dois desvios foram registrados em "Notas de implementação".
- O primeiro teste de aceite falhou por causa do próprio teste (o texto do seletor incluía o ícone "▼"), não do app. A skill distinguiu os dois casos, como o texto dela pede.

**Decisões:**
- PGlite em dev, testes e CI (zero infraestrutura, reproduzível por quem assiste); Neon só em preview e produção (F4).
- O dev abre o PR com o CI **vermelho de propósito**, e o `/esteira:testes` o deixa verde. Isso é o gancho entre o Ep7 e o Ep8.

**Revisão independente da F3:** achou 10 problemas. Todos foram corrigidos com teste de regressão e revalidados no app real da story #10.

| # | Gravidade | Bug | Correção |
|---|---|---|---|
| 1 | Alta | **O reset dos testes podia zerar o Neon.** Com um `DATABASE_URL` no `.env.local` (`vercel env pull`), o `npm run test:e2e` faria `TRUNCATE` no banco remoto a cada teste | Com `E2E=1` é sempre PGlite em memória; a rota recusa (403) se houver `DATABASE_URL`/`VERCEL_ENV`; testado com os servidores de verdade |
| 2 | Alta | **A rastreabilidade podia passar sem testes**: teste comentado contava, `describe.skip` contava, BOM ou aspas no `status` tiravam a spec da cobrança, spec em dev sem AC passava com 0/0 | Remoção de comentários preservando strings e templates, escopo de `describe.skip/fixme` e de `test.skip()` no corpo, `status` normalizado e validado, 0 AC falha |
| 3 | Média | Story só de UI quebrava o `npm run test` (Vitest sem testes = exit 1) | `passWithNoTests` |
| 4 | Média | Transação passava no PGlite e quebraria no Neon via HTTP | O banco local bloqueia `transaction()` (paridade); skills mandam usar um comando SQL atômico; a migração do Neon fica para a F4 |
| 5 | Média | Um 404 da rota de reset seguia com dados sujos (servidor sem `E2E=1` reaproveitado, preview) | A rota responde 403 fora do E2E e o teste falha; `E2E_NO_RESET=1` só de propósito |
| 6 | Média | Uma conexão que falhou ficava em cache até reiniciar | O cache é limpo na falha |
| 7 | Média | Specs sem `status` (anteriores à F3) eram lidas como `backlog` e a skill pedia a etapa anterior em loop | `status` ausente = null, e as skills caem para o estágio das labels |
| 8 | Baixa | `drizzle-kit generate` pergunta de forma interativa em renomeações e trava | A skill de dev só acrescenta e explica como lidar |
| 9 | Baixa | O `TRUNCATE` ignorava `pgSchema` | Usa `getTableConfig` |
| 10 | Baixa | `hasAcceptanceTests` contava comentário; `next.config` em `export default`/`.mjs` não era aceito, e a falha deixava o repo pela metade; `--closes abc` virava `#NaN` | Só título de `test()`; mais formatos e validação **antes** de escrever; números validados |

**Bug meu durante as correções:** editei o `status.mjs` com `String.replace(from, to)`, e o texto novo tinha `` $` ``, que no JavaScript significa "tudo o que vem antes do trecho". O arquivo inteiro foi colado no meio de uma função. Restaurei do git e passei a usar `replace(from, () => to)` em todas as edições por script.

## 2026-11-26 — F4 — Review independente, deploy e release

**O que fiz:**
- **`/esteira:review` + agente `esteira:reviewer`**: o processo que eu mesmo usei a cada fase virou etapa da esteira. A skill roda as checagens determinísticas (rastreabilidade, lint, tipos, unidade e CI do PR). Depois entrega ao revisor **só** a story, a spec e o comando do diff, sem opinião nem resumo, e publica o resultado como comentário de review. O autor do PR não pode aprovar o próprio PR no GitHub, então o merge fica com a pessoa: é o gate.
- **`/esteira:deploy`**: o build da Vercel vira `node scripts/esteira/migrate.mjs && next build`. A migração só roda com `DATABASE_URL` **e** `ESTEIRA_MIGRATE=1`, ligado à mão por ambiente, para que um preview sem branch próprio do Neon nunca migre o banco de produção. Falha de migração derruba o build, e a versão anterior continua no ar. O `docs/deploy.md` cobre configuração, rollback (instant rollback da Vercel; sem rollback de banco, porque as migrações são só aditivas) e diagnóstico. O `deploy-status.mjs` lê produção e previews pela API de deployments do GitHub.
- **`/esteira:release`**: release-please v5 com o changelog em PT-BR, a partir dos títulos dos PRs, que já são Conventional Commits. O merge do Release PR é o gate da versão.

**Teste:**
- Deploy e release instalados num app real; o build no Windows passou com a migração encadeada.
- A trava se confirmou nos três casos: sem banco, pula; sem `ESTEIRA_MIGRATE`, recusa; com os dois e o banco fora do ar, **falha o build**.
- O `deploy-status.mjs` rodou contra o GitHub real (repo sem Vercel e os avisos certos).
- **Não testado:** Neon e Vercel de verdade, porque exigem contas. Fica para o dry-run da F6.

**O `/esteira:review` local na story #10** (259 s, US$ 1,07) achou dois problemas reais:
1. **Bloqueia:** o código **commitado** no branch ainda tinha a rota de reset antiga, que zeraria o Neon. As correções da revisão da F3 estavam só no working tree do repo de teste. O revisor notou essa diferença sozinho.
2. **Importante:** valor/hora digitado como `1.200` era gravado como **R$ 1,20**, e não R$ 1.200,00. Um bug de negócio que passou por spec, dev, 26 testes de unidade e 4 de aceite. É a melhor demonstração do porquê de uma revisão independente depois dos testes.

**Desvio do design (para decidir):** o Q23 previa Playwright **contra o preview da Vercel**. A F3 colocou os testes de aceite no CI com o app local e banco em memória, porque eles precisam zerar o banco antes de cada teste, e o reset é proibido em banco remoto por segurança. O preview fica para a revisão humana.

**Revisão independente da F4:** achou 7 problemas, todos corrigidos.

| # | Gravidade | Bug | Correção |
|---|---|---|---|
| 1 | Alta | O migrador HTTP do Neon roda cada comando **sem transação** e registra no fim. Uma migração que falhasse no meio deixaria o banco pela metade, e **todo build seguinte quebraria** com "already exists". Dois builds simultâneos disputariam a mesma migração | Driver `neon-serverless` (WebSocket), cujo migrador aplica tudo numa transação (conferido no código-fonte do Drizzle), mais um `pg_advisory_lock` para que builds paralelos migrem um de cada vez |
| 2 | Média | `docs:` aparecia no changelog, e todo merge de spec ou discovery geraria versão nova. Protótipo e DS (`feat`) virariam "Novidades" | `docs` oculto; gates de protótipo e DS passam a ser `chore(...)`; só story implementada (`feat(#n)`) e `fix` sobem versão |
| 3 | Média | Depois de um Instant Rollback, a Vercel **para de promover** a `main` sozinha, e a correção mergeada não iria para o ar. O status chamava de "produção" o último deploy | Runbook e skill explicam o Undo Rollback; o status diz "último deploy de produção" |
| 4 | Média | "Só aditiva" não basta: coluna nova `NOT NULL` sem default quebra o código antigo num rollback e falha a migração numa tabela com dados | Regra no dev, no revisor e no runbook: coluna nova é nullable ou tem DEFAULT |
| 5 | Média | Com merge commit (o padrão do GitHub), os commits dos gates entram na `main` e o changelog repete entradas da mesma story | `release-check.mjs` confere squash-only com o título do PR, e as permissões do workflow, e diz como corrigir sem mudar nada sozinho |
| 6 | Média | O `gh api repos/{owner}/...` quebra no PowerShell 5.1 (`{owner}` vira script block), e `git tag *` liberava apagar tags | A checagem foi para um script Node; o `git tag` ficou só leitura |
| 7 | Baixa | O status lia só os 50 deploys mais recentes; produção ou o preview de um PR antigo sumiam | Consultas filtradas por ambiente e por branch |

## 2026-11-26 — F6 — Dry-run com GitHub, Vercel e Neon de verdade

**O que fiz:** um produto descartável e público, [esteira-dryrun](https://github.com/alexandredavi/esteira-dryrun) (o "Pauta", uma lista de tarefas do dia), passou pela esteira inteira com 1 story, cada etapa num `claude -p` novo, e eu mergeando os gates depois do CI verde:

| Etapa | Tempo | Custo | O que o mundo real confirmou |
|---|---|---|---|
| setup | 191 s | US$ 0,46 | CI do produto verde no GitHub Actions |
| discovery | 120 s | US$ 0,87 | Pesquisa de concorrentes com fonte (Todoist, To Do, Google Tasks, Tweek) |
| PRD | 89 s | US$ 0,59 | 4 capacidades |
| backlog | 176 s | US$ 0,88 | **4 épicos e 11 stories como issues reais**, com labels |
| design system | 136 s | US$ 0,95 | Todos os pares AA |
| protótipo #8 | 220 s | US$ 1,03 | No merge, o workflow `esteira-gates` **aplicou `design:approved` sozinho** |
| spec #8 | 113 s | US$ 0,80 | No merge, `spec:approved` e `ready-for-dev` sozinhos |
| dev #8 | 220 s | US$ 1,42 | O CI **reprovou exatamente na rastreabilidade (0/4)**; tudo antes dela verde |
| testes #8 | 92 s | US$ 0,71 | CI verde com Playwright no Ubuntu; o status sugeria `/esteira:testes` antes do review |
| review #8 | 100 s | US$ 0,97 | Comentário publicado no PR; 1 achado importante, nada bloqueando |
| merge | — | — | **A issue #8 fechou sozinha** (`Closes #8`) |
| deploy | 62 s | US$ 0,45 | Build da Vercel: `[esteira] migrações aplicadas` no **Neon** (produção e preview com branch próprio); tarefa anotada em produção sobreviveu ao reload |
| release | 48 s | US$ 0,46 | O release-please abriu o Release PR sozinho; no merge, **release v0.2.0** e `CHANGELOG.md` em PT-BR só com a story |

**Total:** cerca de US$ 11 e 30 minutos de etapas, para levar uma story da ideia à produção versionada.

**Achados que só o mundo real mostrou (9), todos corrigidos:**
1. O setup listava o `next-env.d.ts` (que o `.gitignore` do Next ignora) e o `git add` do gate quebrava. Agora o gate descarta os caminhos ignorados.
2. **Ao bater num script quebrado, a skill tentou editar o próprio plugin.** Todas as skills agora proíbem isso: mostram o erro e param.
3. O DS tentou `git checkout -b` e copiar o template com `node -e` (negados; ele se recuperou sozinho).
4. O `page.clock` do Playwright **não alcança o servidor**. A orientação de spec e testes foi corrigida: tempo calculado no servidor se testa em unidade.
5. **O resultado de um subagente chega num turno seguinte, em que os `allowed-tools` da skill já não valem.** O review não conseguiu publicar. Review e discovery agora trabalham no próprio turno, com o checklist do agente, e a independência vem de rodar numa sessão nova.
6. (Achado pelo próprio `/esteira:review`) Sem `DATABASE_URL` na Vercel, o app caía em silêncio num banco em memória. Agora falha com mensagem clara.
7. **A Vercel não usa a API de Deployments do GitHub:** ela reporta um commit status "Vercel" e a URL do preview no comentário do bot. O `deploy-status.mjs` foi reescrito com os formatos reais.
8. O Release PR não roda CI (PR aberto pelo `GITHUB_TOKEN` não dispara workflows). Agora a skill avisa.
9. A tag saiu `app-v0.2.0`, porque o pacote herdou o nome `app` da pasta temporária do setup. O setup passa a usar o nome do repo, e a config deixa de pôr o componente na tag.

**Eu errei duas vezes, e o diário registra:**
- De novo um `\n` atravessando heredoc, JS e substituição virou quebra de linha real e deixou o `gate.mjs` com erro de sintaxe **enquanto o discovery do dry-run usava o plugin**. Corrigi em um minuto.
- Usei `git commit -am` no dry-run e levei junto uma linha que o `vercel link` tinha posto no `.gitignore`.

**Configuração feita por mim, com o OK do Alexandre:** repo público, só squash merge com o título do PR, permissões do Actions, `ESTEIRA_MIGRATE=1` (Production e Preview, porque o Neon cria um branch por preview) e o redeploy. Primeiro foi preciso descobrir que o redeploy inicial tinha **pulado** a migração: a trava funcionou como projetado.
