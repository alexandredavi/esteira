# esteira

Esteira de produto e desenvolvimento conduzida por IA — do **discovery ao deploy** — como plugin do [Claude Code](https://claude.com/claude-code).

Você entra com uma ideia bruta. A esteira conduz discovery, PRD, backlog, design system, protótipo, spec, código, testes, review, deploy e release. Você aprova cada etapa num Pull Request.

> 🚧 Em construção. Acompanhe a série no YouTube *(link em breve)*.

## Instalação

```
/plugin install esteira --marketplace alexandredavi/esteira
```

Os comandos ficam sob o namespace do plugin: `/esteira:status`, `/esteira:discovery` etc.

## Etapas

| Comando | O que faz | Artefato |
|---|---|---|
| `/esteira:setup` | Monta o app: Next.js + shadcn/ui + regra de lint do DS + workflows de CI e de labels | App + `.github/workflows/` |
| `/esteira:discovery` | Ideia → problema, persona, concorrentes, proposta de valor | `docs/product/discovery.md` |
| `/esteira:prd` | Visão e escopo do MVP | `docs/product/prd.md` |
| `/esteira:backlog` | Épicos e stories com critérios em Gherkin, no GitHub Projects | Issues + `docs/specs/` |
| `/esteira:design-system` | Identidade, tokens oklch claro/escuro, contraste WCAG verificado, vitrine `/design` | `globals.css` + `docs/design/` |
| `/esteira:prototipo` | Telas navegáveis com o DS, PR com preview | Código + preview |
| `/esteira:spec` | Seção Técnica: modelo de dados, regras, contratos, troca dos mocks, plano de testes por AC | `docs/specs/<issue>-<slug>.md` |
| `/esteira:dev` | Implementa a Técnica: schema + migração, regras com testes de unidade, server actions, mocks → dados reais | PR `Closes #<issue>` |
| `/esteira:testes` | Cada AC em Gherkin vira um teste Playwright com o ID no título; a rastreabilidade do CI exige todos | `e2e/<issue>-<slug>.spec.ts` |
| `/esteira:review` | Revisão por um subagente sem contexto de quem escreveu (spec × código, dados, segurança, testes, DS) + CI e rastreabilidade; o merge é seu | Comentário de review no PR |
| `/esteira:deploy` | Migração do banco no build da Vercel (só com `ESTEIRA_MIGRATE=1`), runbook, estado dos deploys e rollback | `docs/deploy.md` |
| `/esteira:release` | release-please: versão e changelog em PT-BR a partir dos títulos dos PRs; o merge do Release PR é seu | `CHANGELOG.md` + tag |
| `/esteira:status` | Status: o que está em cada etapa e o próximo passo | — |

## Como funciona

- **Todo artefato entra por PR.** O merge é o gate humano; a esteira aplica a label e move o card no GitHub Projects.
- **Critérios de aceite têm ID** (`AC-12.1`) e cada um precisa de um teste. O CI falha se algum ficar descoberto.
- **O Design System é imposto**: lint barra estilos crus e o review checa o uso de componentes.

Detalhes no [documento de design](docs/design.md).

## Stack assumida no produto

Next.js (App Router) · TypeScript · Neon Postgres · Drizzle · Better Auth · shadcn/ui · Vitest · Playwright · Vercel · release-please

## Licença

MIT
