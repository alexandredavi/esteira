#!/usr/bin/env bash
# Semeia um discovery aprovado (sem git: o status lê do disco).
set -euo pipefail
mkdir -p docs/product
cat > docs/product/discovery.md <<'EOF'
# Discovery — Ponteiro

## 1. Ideia original

> Um time tracker simples para freelancers brasileiros controlarem horas por cliente e projeto e saberem quanto faturar no fim do mês.

## 2. Problema

Freelancers que cobram por hora perdem horas faturáveis porque anotam o tempo de memória no fim do dia ou da semana. No fechamento do mês, montar o relatório por cliente leva horas e gera desconfiança do cliente.

## 3. Personas

### P1 — Dev freelancer

- **Contexto:** atende de 2 a 5 clientes ao mesmo tempo, cobra por hora.
- **Objetivo:** faturar todas as horas trabalhadas sem esforço administrativo.
- **Frustração principal:** esquece de anotar e subestima as horas.
- **Como resolve hoje:** planilha preenchida no fim do dia.

## 4. Jobs to be done

1. Quando começo a trabalhar para um cliente, quero registrar o tempo com um clique, para não depender da memória.
2. Quando esqueço de ligar o timer, quero lançar as horas manualmente, para não perder o que trabalhei.
3. Quando o mês fecha, quero ver as horas por cliente e projeto, para cobrar com confiança.

## 5. Alternativas e concorrentes

| Alternativa | Para quem | Pontos fortes | Lacunas | Fonte |
|---|---|---|---|---|
| Planilha | Qualquer pessoa | Grátis, flexível | Manual, sujeita a esquecimento | conhecimento do modelo — validar |
| Time trackers globais | Times e agências | Completos | Complexos para quem trabalha sozinho, em inglês | conhecimento do modelo — validar |

## 6. Proposta de valor

Para freelancers brasileiros que cobram por hora, o Ponteiro é um time tracker que registra horas com um clique e mostra quanto cobrar de cada cliente. Diferente de planilhas e ferramentas para times, é simples e feito para quem trabalha sozinho.

## 7. Nome

**Escolhido:** Ponteiro

## 8. Premissas e hipóteses

| # | Premissa | Como validar |
|---|---|---|
| 1 | O MVP é para uso individual | Entrevistar 5 freelancers |
EOF
