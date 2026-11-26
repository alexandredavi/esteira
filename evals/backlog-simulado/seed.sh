#!/usr/bin/env bash
# Semeia discovery e PRD aprovados (sem git nem GitHub: o backlog deve rodar em --dry-run).
set -euo pipefail
mkdir -p docs/product
cat > docs/product/discovery.md <<'EOF'
# Discovery — Ponteiro

## 2. Problema

Freelancers que cobram por hora perdem horas faturáveis porque anotam o tempo de memória.

## 3. Personas

### P1 — Dev freelancer

- **Contexto:** atende de 2 a 5 clientes, cobra por hora.
- **Frustração principal:** esquece de anotar e subestima as horas.

## 4. Jobs to be done

1. Quando começo a trabalhar para um cliente, quero registrar o tempo com um clique, para não depender da memória.
2. Quando o mês fecha, quero ver as horas por cliente, para cobrar com confiança.

## 7. Nome

**Escolhido:** Ponteiro
EOF
cat > docs/product/prd.md <<'EOF'
# PRD — Ponteiro

## 1. Visão

Freelancers registram horas sem esforço e cobram com confiança.

## 4. Escopo do MVP — capacidades

### CAP-1 — Registrar tempo

- **Job atendido:** JTBD 1
- **Descrição:** a pessoa inicia e para um timer num projeto de um cliente e corrige ou lança horas manualmente.
- **Regras de negócio:** só um timer ativo por vez; um registro pertence a um projeto, e o projeto a um cliente.

### CAP-2 — Relatório por cliente

- **Job atendido:** JTBD 2
- **Descrição:** a pessoa vê o total de horas por cliente e projeto num período.
- **Regras de negócio:** o período padrão é o mês corrente; o total considera só registros encerrados.

## 5. Fora de escopo (MVP)

| Item | Motivo | Quando volta |
|---|---|---|
| Times e convites | MVP é individual | T2 |
| Valor-hora e faturamento | Validar o registro primeiro | T2 |
EOF
