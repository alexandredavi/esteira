### Checklist do revisor

- [ ] Todo critério de aceite (AC) tem uma linha no Plano de testes, com um jeito de preparar o "Dado" pela UI
- [ ] O modelo de dados é coerente com as outras specs: nomes, tipos, dinheiro em centavos, datas em UTC
- [ ] Toda regra de negócio aponta para um AC e mora numa função de domínio que recebe o `db`
- [ ] A troca dos mocks cobre tudo o que o protótipo simulava
- [ ] Os estados reais (vazio, carregando, erro) estão definidos
- [ ] As decisões que fogem do padrão da esteira estão justificadas

**Ao mergear:** a story recebe `spec:approved` e `ready-for-dev`, e o próximo passo é `/esteira:dev`.
