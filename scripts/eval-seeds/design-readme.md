# Design System — Ponteiro

## 1. Identidade

Direto, confiável e leve. Textos curtos, verbos no imperativo, sem jargão.

## 3. Cores

Primária azul-petróleo (`--primary`), neutros levemente frios. Destrutivo só para excluir e erros.

## 4. Tipografia

Uma família sans (Geist). Horas e valores sempre com `tabular-nums`.

## 6. Componentes

| Componente | Quando usar |
|---|---|
| Button | Ações. Primário para a ação principal da tela, outline para secundárias |
| Card | Agrupar um bloco de informação |
| Input + Label | Campos de formulário |
| Badge | Status curtos (rodando, parado) |
| Alert | Erros e avisos |
| Skeleton | Carregando |
| Table | Listas de registros |

## 7. Regras

- Só tokens semânticos (`bg-primary`, `text-muted-foreground`). O lint `esteira-ds/no-raw-styles` barra o resto.
