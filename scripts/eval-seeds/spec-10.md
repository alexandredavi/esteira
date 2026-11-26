---
issue: 10
epic: 2
slug: timer-iniciar-parar
---

# #10 — Iniciar e parar o timer

> Épico: #2 Registro de tempo com timer · Gerado por `/esteira:backlog`. Cada etapa seguinte preenche a sua seção.

## Produto

### User story

**Como** freela PJ multi-cliente, **quero** iniciar e parar um timer num projeto, com uma descrição opcional, **para** minhas horas fiquem registradas sem depender da memória.

### Contexto

Segunda fatia do esqueleto que anda. Registros com menos de 1 minuto são descartados. O registro guarda a origem timer e o valor/hora vigente. Iniciar ou parar responde em até 1 s; uso com uma mão em tela de 360 px.

### Critérios de aceite

<!-- Cada critério tem um ID estável AC-<issue>.<n>. Os testes E2E referenciam esse ID no título. Não renumere. -->

#### AC-10.1 — Inicia o timer num projeto

```gherkin
Cenário: Inicia o timer num projeto
  Dado que tenho o projeto Site Institucional do cliente Padaria Sol
  Quando inicio o timer nesse projeto
  Então vejo o tempo correndo a partir de 00:00:00
  E vejo o projeto e o cliente do timer
```

#### AC-10.2 — Para o timer e gera o registro

```gherkin
Cenário: Para o timer e gera o registro
  Dado que o timer está rodando há 45 minutos no projeto Site Institucional
  Quando paro o timer
  Então vejo um registro de 45 min no projeto Site Institucional na data de hoje
```

#### AC-10.3 — Descarta registro com menos de 1 minuto

```gherkin
Cenário: Descarta registro com menos de 1 minuto
  Dado que iniciei o timer há 30 segundos
  Quando paro o timer
  Então nenhum registro é criado
  E vejo um aviso de que registros com menos de 1 minuto são descartados
```

#### AC-10.4 — Sem projetos cadastrados

```gherkin
Cenário: Sem projetos cadastrados
  Dado que ainda não tenho nenhum projeto
  Quando tento iniciar o timer
  Então vejo um convite para cadastrar um cliente e um projeto
```

### Fora de escopo

- Pausar e retomar o mesmo registro
- Lançar horas de dias passados

## Design

<!-- Preenchido por /esteira:prototipo: telas, estados (vazio, carregando, erro), componentes do DS usados, link do preview. -->

_Pendente._

## Técnica

<!-- Preenchido por /esteira:spec: modelo de dados, contratos, decisões, riscos técnicos. -->

_Pendente._
