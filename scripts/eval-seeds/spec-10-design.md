---
issue: 10
epic: 2
slug: timer-iniciar-parar
status: design
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

### Rotas
- `/timer` — escolha do projeto, descrição opcional, Iniciar/Parar, cronômetro e lista de registros de hoje.

### Como ver cada critério
| AC | Onde | Como |
|---|---|---|
| AC-10.1 | `/timer` | Escolha o projeto e toque em Iniciar |
| AC-10.2 | `/timer?estado=rodando` | Toque em Parar: aparece o registro de 45 min |
| AC-10.3 | `/timer` | Inicie e pare antes de 1 minuto: aviso de descarte |
| AC-10.4 | `/timer?estado=vazio` | Sem projetos: convite para cadastrar |

### Estados
| Estado | URL |
|---|---|
| Vazio | `/timer?estado=vazio` |
| Carregando | `/timer?estado=carregando` |
| Erro | `/timer?estado=erro` |

### Componentes do DS
Card, Button, Select, Input, Label, Badge, Table, Alert, Skeleton. Novos: nenhum.

### Mocks
`src/lib/mocks/tempo.ts` — clientes, projetos (com valor/hora) e registros de hoje. O /esteira:dev troca por dados reais.

## Técnica

<!-- Preenchido por /esteira:spec: modelo de dados, contratos, decisões, riscos técnicos. -->

_Pendente._
