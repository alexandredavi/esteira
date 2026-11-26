#!/usr/bin/env node
// Confere o contraste WCAG dos tokens do Design System em globals.css (temas :root e .dark).
//
// node contrast.mjs [caminho/globals.css]   (padrão: o "tailwind.css" do components.json, ou src/app/globals.css)
// → JSON { ok, themes: { light: [...], dark: [...] }, failures: [...] }; exit 1 se algum par reprovar.
//
// Pares de texto: AA 4.5:1. Destrutivo sobre o fundo: 3:1 (ícones, bordas, texto grande).
// Cores com transparência (ex.: bordas "oklch(1 0 0 / 10%)") ficam de fora: dependem do que está atrás.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { print } from "./lib.mjs";

export const PAIRS = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive", "background", 3],
];

// OKLCH → sRGB linear (Björn Ottosson), com clamp para o gamut sRGB.
export function oklchToLinearRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Converte uma cor CSS (oklch ou hex) em sRGB linear. Devolve null para cores com alfa ou formatos desconhecidos. */
export function parseColor(value) {
  const v = value.trim();
  const ok = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(\/\s*[\d.]+%?)?\s*\)$/i.exec(v);
  if (ok) {
    if (ok[4] && !/^\/\s*(1|100%)$/.test(ok[4].trim())) return null;
    const L = ok[1].endsWith("%") ? parseFloat(ok[1]) / 100 : parseFloat(ok[1]);
    return oklchToLinearRgb(L, parseFloat(ok[2]), parseFloat(ok[3]));
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
  }
  return null;
}

export const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function contrast(c1, c2) {
  const [a, b] = [luminance(c1), luminance(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Extrai as variáveis de um bloco (":root" ou ".dark") do CSS. */
export function readVars(css, selector) {
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`);
  const block = re.exec(css)?.[2];
  if (!block) return null;
  const vars = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

export function check(css) {
  const themes = {};
  const failures = [];
  for (const [theme, selector] of [["light", ":root"], ["dark", ".dark"]]) {
    const vars = readVars(css, selector);
    if (!vars) { failures.push({ theme, error: `bloco ${selector} não encontrado` }); continue; }
    themes[theme] = PAIRS.map(([fg, bg, min]) => {
      const a = vars[fg] && parseColor(vars[fg]);
      const b = vars[bg] && parseColor(vars[bg]);
      if (!a || !b) return { fg, bg, min, ratio: null, pass: false, note: `não consegui ler ${!a ? fg : bg} (${vars[!a ? fg : bg] ?? "ausente"})` };
      const ratio = Math.round(contrast(a, b) * 100) / 100;
      return { fg, bg, min, ratio, pass: ratio >= min };
    });
    for (const r of themes[theme]) if (!r.pass) failures.push({ theme, ...r });
  }
  return { ok: failures.length === 0, themes, failures };
}

function defaultCssPath(cwd) {
  try {
    const cfg = JSON.parse(readFileSync(join(cwd, "components.json"), "utf8"));
    if (cfg?.tailwind?.css) return join(cwd, cfg.tailwind.css);
  } catch {}
  return join(cwd, "src/app/globals.css");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2] ? resolve(process.argv[2]) : defaultCssPath(process.cwd());
  if (!existsSync(path)) print({ ok: false, error: `Arquivo não encontrado: ${path}` }, 1);
  else {
    const result = { path, ...check(readFileSync(path, "utf8")) };
    print(result, result.ok ? 0 : 1);
  }
}
