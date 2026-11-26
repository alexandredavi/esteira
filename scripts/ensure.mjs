#!/usr/bin/env node
// Instala no app do produto as camadas que as etapas de engenharia precisam. Idempotente.
//
// node ensure.mjs db     → Drizzle + PGlite (local/testes) + Neon (produção), src/db/, drizzle.config.ts
// node ensure.mjs tests  → Vitest + Playwright, e2e/support.ts, rastreabilidade, CI v2
//   [--cwd repo] [--skip-install]
//
// Nunca sobrescreve arquivo existente (exceto o ci.yml, e só se ainda for o template original da esteira).
// Imprime JSON com o que mudou e os caminhos para o commit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, print } from "./lib.mjs";
import { mergeGitignore, sh } from "./setup.mjs";

const T = fileURLToPath(new URL("../templates/app/", import.meta.url));

export const PACKAGES = {
  db: {
    deps: ["drizzle-orm@0.45.4", "@electric-sql/pglite@0.6.0", "@neondatabase/serverless@1.2.1"],
    dev: ["drizzle-kit@0.31.11"],
  },
  // @types/node ^24: o template do Next traz ^20, e o Vitest 5 exige >= 22.
  tests: { deps: [], dev: ["vitest@5.1.2", "@playwright/test@1.65.1", "@types/node@^24"] },
};

const FILES = {
  db: [
    ["db/index.ts", "src/db/index.ts"],
    ["db/local.ts", "src/db/local.ts"],
    ["db/schema.ts", "src/db/schema.ts"],
    ["db/testing.ts", "src/db/testing.ts"],
    ["drizzle.config.ts", "drizzle.config.ts"],
  ],
  tests: [
    ["vitest.config.ts", "vitest.config.ts"],
    ["playwright.config.ts", "playwright.config.ts"],
    ["e2e/support.ts", "e2e/support.ts"],
    ["esteira/traceability.mjs", "scripts/esteira/traceability.mjs"],
  ],
};
const RESET_ROUTE = ["api-e2e-reset/route.ts", "src/app/api/e2e/reset/route.ts"];

const SCRIPTS = {
  db: { "db:generate": "drizzle-kit generate" },
  tests: { test: "vitest run", "test:e2e": "playwright test", trace: "node scripts/esteira/traceability.mjs" },
};

const GITIGNORE = { db: [".esteira/"], tests: ["test-results/", "playwright-report/", "blob-report/"] };

export function patchNextConfig(src) {
  if (src.includes("serverExternalPackages")) {
    if (src.includes("@electric-sql/pglite")) return src;
    return src.replace(/serverExternalPackages:\s*\[/, 'serverExternalPackages: ["@electric-sql/pglite", ');
  }
  const m = /const nextConfig(?::\s*NextConfig)?\s*=\s*\{/.exec(src);
  if (!m) throw new Error("Não reconheci o next.config.ts para adicionar serverExternalPackages.");
  const at = m.index + m[0].length;
  return src.slice(0, at) + '\n  serverExternalPackages: ["@electric-sql/pglite"],' + src.slice(at);
}

const normalize = (s) => s.replace(/\r\n/g, "\n").trim();

/** Decide o que fazer com o ci.yml do produto. */
export function upgradeCi(current) {
  const v2 = readFileSync(join(T, "workflows/ci.yml"), "utf8");
  if (current == null) return { action: "create", content: v2 };
  if (normalize(current) === normalize(v2)) return { action: "keep" };
  if (normalize(current) === normalize(readFileSync(join(T, "workflows/legacy/ci-v1.yml"), "utf8"))) return { action: "upgrade", content: v2 };
  if (current.includes("test:e2e") && current.includes("traceability")) return { action: "keep" };
  return { action: "warn", note: "O ci.yml foi customizado: acrescente à mão os passos de teste, rastreabilidade e Playwright (veja o template da esteira em templates/app/workflows/ci.yml)." };
}

export function ensure(feature, opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!FILES[feature]) return { ok: false, error: `Camada desconhecida: ${feature}. Use db ou tests.` };
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, error: "Sem package.json: rode /esteira:setup antes." };

  const changed = [];
  const notes = [];
  const write = (rel, content) => {
    const abs = join(cwd, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    changed.push(rel);
  };
  const copy = ([from, to]) => { if (!existsSync(join(cwd, to))) write(to, readFileSync(join(T, from), "utf8")); };

  for (const f of FILES[feature]) copy(f);
  // A rota de reset precisa das duas camadas: banco (para zerar) e testes (quem usa).
  if (existsSync(join(cwd, "src/db/index.ts")) && existsSync(join(cwd, "e2e/support.ts"))) copy(RESET_ROUTE);

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const scripts = { ...pkg.scripts };
  for (const [k, v] of Object.entries(SCRIPTS[feature])) if (!scripts[k]) scripts[k] = v;
  if (JSON.stringify(scripts) !== JSON.stringify(pkg.scripts)) { pkg.scripts = scripts; write("package.json", JSON.stringify(pkg, null, 2) + "\n"); }

  if (feature === "db") {
    const nc = join(cwd, "next.config.ts");
    if (existsSync(nc)) {
      const before = readFileSync(nc, "utf8");
      const after = patchNextConfig(before);
      if (after !== before) write("next.config.ts", after);
    } else notes.push("next.config.ts não encontrado: adicione serverExternalPackages: [\"@electric-sql/pglite\"] à mão.");
  }

  if (feature === "tests") {
    const ciPath = join(cwd, ".github/workflows/ci.yml");
    const ci = upgradeCi(existsSync(ciPath) ? readFileSync(ciPath, "utf8") : null);
    if (ci.action === "create" || ci.action === "upgrade") write(".github/workflows/ci.yml", ci.content);
    if (ci.action === "warn") notes.push(ci.note);
  }

  const gi = join(cwd, ".gitignore");
  const giBefore = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  const giAfter = mergeGitignore(giBefore, "", GITIGNORE[feature]);
  if (giAfter !== giBefore) write(".gitignore", giAfter);

  const installed = [];
  if (!opts["skip-install"]) {
    const { deps, dev } = PACKAGES[feature];
    const has = (spec) => {
      const name = spec.replace(/@[^@/]+$/, "");
      const current = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      if (!current) return false;
      // @types/node precisa ser >= 22 (Vitest 5); a versão ^20 do template do Next é trocada.
      if (name === "@types/node") return Number(/\d+/.exec(current)?.[0]) >= 22;
      return true;
    };
    const missingDeps = deps.filter((d) => !has(d));
    const missingDev = dev.filter((d) => !has(d));
    if (missingDeps.length) {
      const r = sh("npm", ["install", "--no-audit", "--no-fund", ...missingDeps], cwd);
      if (!r.ok) return { ok: false, error: `npm install falhou: ${r.err.slice(-800)}`, changed };
      installed.push(...missingDeps);
    }
    if (missingDev.length) {
      const r = sh("npm", ["install", "--no-audit", "--no-fund", "-D", ...missingDev], cwd);
      if (!r.ok) return { ok: false, error: `npm install -D falhou: ${r.err.slice(-800)}`, changed };
      installed.push(...missingDev);
    }
    if (installed.length) { changed.push("package.json", "package-lock.json"); }
  }

  const paths = [...new Set(changed)].filter((p) => existsSync(join(cwd, p))).sort();
  return { ok: true, feature, changed: paths, installed, notes, paths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  let result;
  try { result = ensure(args._[0], args); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
