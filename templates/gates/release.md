### Checklist do revisor

- [ ] As seções do changelog estão em PT-BR (Novidades, Correções, Desempenho); `docs`, `chore`, `ci` e `test` não geram versão
- [ ] O repo aceita só **squash merge**, com o título do PR como mensagem (o `/esteira:release` confere)
- [ ] Em *Settings → Actions → General*, as permissões de workflow estão em **Read and write**, com **Allow GitHub Actions to create and approve pull requests** ligado

**Depois do merge:** o release-please abre o Release PR no próximo push na `main`, e `/esteira:release` mostra o que entra na versão.
