# Design System — {{nome_do_produto}}

> Gerado por `/esteira:design-system` em {{data}} a partir do [discovery](../product/discovery.md). Vitrine: rota `/design`. Aprovado quando o PR é mergeado.

## 1. Identidade

<!-- Personalidade em 3 adjetivos, com uma frase cada sobre como aparece na interface. Tom de voz dos textos (ex.: direto, caloroso, sem jargão). -->

## 2. Princípios

<!-- 3 ou 4 princípios de design que decidem empates. Ex.: "Um toque para registrar", "Números sempre legíveis". -->

## 3. Cores

<!-- Tokens semânticos (não a paleta). Valores em oklch, iguais aos de globals.css. -->

| Token | Claro | Escuro | Uso |
|---|---|---|---|

### Contraste (WCAG)

<!-- Copie o resultado de contrast.mjs. Texto: AA 4.5:1. Destrutivo sobre o fundo: 3:1. -->

| Par | Claro | Escuro | Mínimo |
|---|---|---|---|

## 4. Tipografia

<!-- Família(s) e motivo da escolha, pesos usados, escala (text-sm…text-3xl) e onde cada nível aparece. Números: tabular-nums em horas e valores. -->

## 5. Forma e espaço

<!-- --radius e a escala derivada (rounded-sm…xl), densidade (compacta/confortável) e o espaçamento padrão entre blocos (gap-2, gap-4, gap-6). -->

## 6. Componentes

<!-- Liste os componentes de src/components/ui com quando usar cada um. -->

| Componente | Quando usar |
|---|---|

## 7. Regras

- Use só tokens semânticos (`bg-primary`, `text-muted-foreground`, `rounded-lg`). A regra `esteira-ds/no-raw-styles` barra no lint cores da paleta crua, valores arbitrários de cor, espaçamento, fonte e raio, e cor em `style={{}}`.
- Antes de criar um componente novo, combine os de `src/components/ui`. Se um componente novo for necessário, ele entra em `src/components/` e é justificado na seção Design da spec.
- Um token novo é uma mudança de DS: entra em `globals.css` (claro e escuro), passa pelo contraste e é documentado aqui.
