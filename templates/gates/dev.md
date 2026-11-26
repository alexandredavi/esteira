### Checklist do revisor

- [ ] O CI está verde: lint (com a regra do DS), tipos, testes de unidade, build, **rastreabilidade** e **testes de aceite**
- [ ] A implementação segue a seção Técnica da spec (ou as divergências estão em "Notas de implementação")
- [ ] As regras de negócio têm testes de unidade, e cada AC tem um teste de aceite com o ID no título
- [ ] A migração em `drizzle/` corresponde ao schema
- [ ] Os mocks do protótipo que ficaram sem uso foram removidos
- [ ] Abri o preview e percorri a story

**Ao mergear:** a issue é fechada (`Closes #…`) e a story vai para *Done*.
