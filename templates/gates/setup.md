### Checklist do revisor

- [ ] O CI deste PR passou (lint com a regra do DS, typecheck e build)
- [ ] `README.md` e `docs/` não foram sobrescritos
- [ ] `.gitignore` inclui `node_modules`, `.next` e `.esteira/`
- [ ] `eslint.config.mjs` registra `esteira-ds/no-raw-styles`
- [ ] `.github/workflows/esteira-gates.yml` está presente (aplica as labels quando um gate é mergeado)

**Depois do merge:** conecte o repo na Vercel para ter preview por PR.
