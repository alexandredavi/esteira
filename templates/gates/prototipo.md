### Checklist do revisor

- [ ] Abri o preview e naveguei pelas telas (ou rodei `npm run dev`)
- [ ] Cada critério de aceite (AC) da story dá para ver no protótipo, conforme o mapa na seção Design da spec
- [ ] Os estados vazio, carregando e erro aparecem com `?estado=…`
- [ ] Só são usados componentes e tokens do DS (o lint garante os tokens; confira se não surgiu componente novo sem motivo)
- [ ] Os dados são mock (`src/lib/mocks/`): nenhuma chamada real a API ou banco

**Ao mergear:** a story recebe a label `design:approved` (workflow `esteira-gates`) e o próximo passo é `/esteira:spec`.
