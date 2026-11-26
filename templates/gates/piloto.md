### Checklist do revisor

- [ ] Existe o secret `ANTHROPIC_API_KEY` (com limite de gasto) ou `CLAUDE_CODE_OAUTH_TOKEN` em *Settings → Secrets and variables → Actions*
- [ ] O `esteira-gates.yml` dispara o piloto quando uma spec é aprovada, com a permissão `actions: write`
- [ ] O `ci.yml` aceita `workflow_dispatch` (o PR aberto pelo piloto não dispara o CI sozinho)
- [ ] Entendi que o piloto **não mergeia**: ele para no comentário de review

**Depois do merge:** a próxima spec aprovada dispara o piloto. Acompanhe com `/esteira:piloto status`.
