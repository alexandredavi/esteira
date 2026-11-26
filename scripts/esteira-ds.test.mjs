import { test } from "node:test";
import assert from "node:assert/strict";
import { findRawStyleViolations as v } from "../templates/app/eslint-rules/esteira-ds.mjs";
import config from "../templates/app/eslint-rules/esteira-ds.mjs";

const bad = (s) => v(s).map((x) => x.cls);

test("tokens semânticos passam", () => {
  assert.deepEqual(v("bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg p-4 gap-2 text-sm font-heading border-border ring-ring/50"), []);
  assert.deepEqual(v("bg-transparent text-current border-input bg-muted/50 dark:bg-input/30"), []);
});

test("cores da paleta crua são barradas, com variantes e opacidade", () => {
  assert.deepEqual(bad("bg-red-500 hover:text-blue-600 md:border-zinc-200/50 ring-emerald-400"), ["bg-red-500", "hover:text-blue-600", "md:border-zinc-200/50", "ring-emerald-400"]);
  assert.deepEqual(bad("text-white bg-black/50 border-white"), ["text-white", "bg-black/50", "border-white"]);
});

test("valores arbitrários de cor, espaçamento, fonte e raio", () => {
  assert.deepEqual(bad("bg-[#fff] text-[oklch(0.5_0.1_20)] p-[7px] -mt-[3px] gap-x-[10px] text-[13px] rounded-[6px] rounded-tl-[4px] font-[Inter]"),
    ["bg-[#fff]", "text-[oklch(0.5_0.1_20)]", "p-[7px]", "-mt-[3px]", "gap-x-[10px]", "text-[13px]", "rounded-[6px]", "rounded-tl-[4px]", "font-[Inter]"]);
});

test("mensagem certa para tamanho de fonte arbitrário", () => {
  assert.match(v("text-[13px]")[0].reason, /tamanho de fonte/);
  assert.match(v("text-[#333]")[0].reason, /cor arbitrária/);
});

test("tamanhos arbitrários de layout são permitidos", () => {
  assert.deepEqual(v("w-[320px] max-w-[60ch] h-[calc(100vh-4rem)] grid-cols-[1fr_auto] top-[3px] text-balance"), []);
});

test("variantes com colchetes e modificador ! são entendidos", () => {
  assert.deepEqual(bad("[&>svg]:text-red-500 !bg-blue-500 data-[state=open]:bg-accent"), ["[&>svg]:text-red-500", "!bg-blue-500"]);
});

test("config pronta para o eslint.config.mjs", () => {
  assert.equal(config.rules["esteira-ds/no-raw-styles"], "error");
  assert.deepEqual(config.ignores, ["src/components/ui/**"]);
  assert.ok(config.plugins["esteira-ds"].rules["no-raw-styles"].create);
});

// Simula o ESLint com nós AST mínimos para cobrir o visitante.
function lint(visitorName, node) {
  const reports = [];
  const visitors = config.plugins["esteira-ds"].rules["no-raw-styles"].create({ report: (r) => reports.push(r) });
  visitors[visitorName](node);
  return reports.map((r) => r.messageId + ":" + (r.data.cls ?? r.data.prop));
}
const lit = (value) => ({ type: "Literal", value });

test("visitante: className literal, cn() com objeto/condicional e style inline", () => {
  assert.deepEqual(lint("JSXAttribute", { name: { name: "className" }, value: lit("p-4 bg-red-500") }), ["raw:bg-red-500"]);
  const cnCall = {
    type: "CallExpression", callee: { type: "Identifier", name: "cn" },
    arguments: [lit("flex"), { type: "ConditionalExpression", consequent: lit("text-white"), alternate: lit("text-foreground") },
      { type: "ObjectExpression", properties: [{ type: "Property", key: lit("bg-[#000]"), value: { type: "Identifier", name: "x" } }] }],
  };
  assert.deepEqual(lint("CallExpression", cnCall), ["raw:text-white", "raw:bg-[#000]"]);
  const style = { name: { name: "style" }, value: { expression: { type: "ObjectExpression", properties: [{ key: { name: "color" } }, { key: { name: "width" } }] } } };
  assert.deepEqual(lint("JSXAttribute", style), ["style:color"]);
  assert.deepEqual(lint("CallExpression", { type: "CallExpression", callee: { type: "Identifier", name: "format" }, arguments: [lit("bg-red-500")] }), []);
});

test("className={cn(...)} não reporta em dobro: quem reporta é o visitante da chamada", () => {
  const call = { type: "CallExpression", callee: { type: "Identifier", name: "cn" }, arguments: [lit("bg-red-500")] };
  assert.deepEqual(lint("JSXAttribute", { name: { name: "className" }, value: { type: "JSXExpressionContainer", expression: call } }), []);
  assert.deepEqual(lint("CallExpression", call), ["raw:bg-red-500"]);
  const other = { type: "CallExpression", callee: { type: "Identifier", name: "pick" }, arguments: [lit("text-white")] };
  assert.deepEqual(lint("JSXAttribute", { name: { name: "className" }, value: { type: "JSXExpressionContainer", expression: other } }), ["raw:text-white"]);
});

test("revisão F2: valores arbitrários que não são cor passam", () => {
  assert.deepEqual(v("stroke-[1.5] border-[2px] ring-[3px] outline-[2px] decoration-[3px] to-[50%] from-[10%] bg-[url(/x.png)] border-l-[3px]"), []);
});

test("revisão F2: cor arbitrária em várias formas é barrada", () => {
  assert.deepEqual(bad("fill-[#000] stroke-[rgb(0,0,0)] bg-[oklch(0.5_0.1_20)] text-[var(--minha-cor)] border-[color:var(--x)] bg-[hsl(10_50%_50%)]"),
    ["fill-[#000]", "stroke-[rgb(0,0,0)]", "bg-[oklch(0.5_0.1_20)]", "text-[var(--minha-cor)]", "border-[color:var(--x)]", "bg-[hsl(10_50%_50%)]"]);
  assert.match(v("text-[length:13px]")[0].reason, /tamanho de fonte/);
});

test("revisão F2: modificadores de opacidade e utilidades novas", () => {
  assert.deepEqual(bad("bg-red-500/[.3] text-red-500/[0.5] bg-black/[.5] bg-red-500/(--o) border-s-red-500 border-e-blue-200 text-shadow-red-500 drop-shadow-red-500 inset-ring-zinc-200 inset-shadow-black"),
    ["bg-red-500/[.3]", "text-red-500/[0.5]", "bg-black/[.5]", "bg-red-500/(--o)", "border-s-red-500", "border-e-blue-200", "text-shadow-red-500", "drop-shadow-red-500", "inset-ring-zinc-200", "inset-shadow-black"]);
  assert.deepEqual(v("text-shadow-lg drop-shadow-md shadow-sm inset-shadow-sm border-s border-e-2"), []);
});

test("revisão F2: expressões dentro de template literal e wrappers de TS", () => {
  const tpl = { type: "TemplateLiteral", quasis: [{ value: { cooked: "p-4 " } }, { value: { cooked: "" } }],
    expressions: [{ type: "ConditionalExpression", consequent: lit("bg-red-500"), alternate: lit("") }] };
  assert.deepEqual(lint("JSXAttribute", { name: { name: "className" }, value: { type: "JSXExpressionContainer", expression: tpl } }), ["raw:bg-red-500"]);
  const asExpr = { type: "TSAsExpression", expression: lit("text-white") };
  assert.deepEqual(lint("JSXAttribute", { name: { name: "className" }, value: { type: "JSXExpressionContainer", expression: asExpr } }), ["raw:text-white"]);
});

test("revisão F2: o arquivo da regra não contém classes com url() (o Tailwind v4 varre o projeto e o build quebra)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../templates/app/eslint-rules/esteira-ds.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\[url\(/);
});
