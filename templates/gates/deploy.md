### Checklist do revisor

- [ ] O CI está verde (o build local só avisa "sem DATABASE_URL: migração pulada")
- [ ] O `build` do `package.json` é `node scripts/esteira/migrate.mjs && next build`
- [ ] Li o `docs/deploy.md` e sei onde ligar o `ESTEIRA_MIGRATE=1` (Production sempre; Preview só com branch do Neon por preview)

**Depois do merge:** faça a configuração única na Vercel e no Neon (passo a passo no `docs/deploy.md`) e rode `/esteira:deploy status`.
