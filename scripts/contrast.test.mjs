import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, contrast, check, readVars } from "./contrast.mjs";

const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test("contraste de referência: preto x branco = 21, hex e oklch concordam", () => {
  near(contrast(parseColor("#000"), parseColor("#ffffff")), 21);
  near(contrast(parseColor("oklch(0 0 0)"), parseColor("oklch(1 0 0)")), 21, 0.1);
  near(contrast(parseColor("#777777"), parseColor("#ffffff")), 4.48);
});

test("cores com alfa e formatos desconhecidos não são lidos", () => {
  assert.equal(parseColor("oklch(1 0 0 / 10%)"), null);
  assert.notEqual(parseColor("oklch(1 0 0 / 100%)"), null);
  assert.equal(parseColor("var(--x)"), null);
  assert.notEqual(parseColor("oklch(62% 0.2 250)"), null);
});

const css = (primaryFg) => `
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0); --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0); --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.55 0.2 260);
  --primary-foreground: ${primaryFg};
  --secondary: oklch(0.97 0 0); --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0); --muted-foreground: oklch(0.5 0 0);
  --accent: oklch(0.97 0 0); --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
}
.dark {
  --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0); --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0); --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.75 0.15 260); --primary-foreground: oklch(0.2 0.05 260);
  --secondary: oklch(0.269 0 0); --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0); --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0); --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
}`;

test("tema que passa", () => {
  const r = check(css("oklch(0.985 0 0)"));
  assert.equal(r.ok, true, JSON.stringify(r.failures));
  assert.equal(r.themes.light.length, 9);
  assert.equal(r.themes.dark.length, 9);
});

test("primary-foreground com pouco contraste reprova e diz o par", () => {
  const r = check(css("oklch(0.7 0.1 260)"));
  assert.equal(r.ok, false);
  assert.deepEqual(r.failures.map((f) => `${f.theme}:${f.fg}/${f.bg}`), ["light:primary-foreground/primary"]);
});

test("bloco ausente e token ilegível viram falha explicada", () => {
  const r = check(":root { --background: oklch(1 0 0); }");
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.error?.includes(".dark")));
  assert.ok(r.failures.some((f) => f.note?.includes("foreground")));
});

test("readVars não confunde :root com seletores parecidos", () => {
  assert.equal(readVars(".darker { --x: 1; }", ".dark"), null);
  assert.deepEqual(readVars(":root{--a: oklch(1 0 0);}", ":root"), { a: "oklch(1 0 0)" });
});

test("o tema padrão do shadcn (base-nova neutro) reprova muted-foreground sobre muted no claro (4.34:1)", () => {
  const shadcn = css("oklch(0.985 0 0)").replace("--primary: oklch(0.55 0.2 260)", "--primary: oklch(0.205 0 0)").replace("--muted-foreground: oklch(0.5 0 0)", "--muted-foreground: oklch(0.556 0 0)");
  const r = check(shadcn);
  assert.deepEqual(r.failures.map((f) => [f.theme, f.fg, f.bg, f.ratio]), [["light", "muted-foreground", "muted", 4.34]]);
});
