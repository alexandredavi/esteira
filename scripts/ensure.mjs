#!/usr/bin/env node
// Instala no app do produto as camadas que as etapas de engenharia precisam. Idempotente.
//
// node ensure.mjs db     → Drizzle + PGlite (local/testes) + Neon (produção), src/db/, drizzle.config.ts
// node ensure.mjs tests  → Vitest + Playwright, e2e/support.ts, rastreabilidade, CI v2
// node ensure.mjs deploy → migração no build da Vercel (scripts/esteira/migrate.mjs) + docs/deploy.md
// node ensure.mjs release → release-please (workflow, config e manifest com a versão do package.json)
// node ensure.mjs piloto → piloto automático (workflow esteira-piloto + gates e CI que o disparam)
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
  deploy: { deps: [], dev: [] },
  release: { deps: [], dev: [] },
  piloto: { deps: [], dev: [] },
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
  deploy: [
    ["esteira/migrate.mjs", "scripts/esteira/migrate.mjs"],
    ["../deploy.md", "docs/deploy.md"],
  ],
  release: [
    ["workflows/release-please.yml", ".github/workflows/release-please.yml"],
    ["release-please-config.json", "release-please-config.json"],
  ],
  piloto: [
    ["workflows/esteira-piloto.yml", ".github/workflows/esteira-piloto.yml"],
  ],
};
const NEXT_CONFIGS = ["next.config.ts", "next.config.mjs", "next.config.js"];
const RESET_ROUTE = ["api-e2e-reset/route.ts", "src/app/api/e2e/reset/route.ts"];

const SCRIPTS = {
  db: { "db:generate": "drizzle-kit generate" },
  tests: { test: "vitest run", "test:e2e": "playwright test", trace: "node scripts/esteira/traceability.mjs" },
  deploy: {},
  release: {},
  piloto: {},
};

const GITIGNORE = { db: [".esteira/"], tests: ["test-results/", "playwright-report/", "blob-report/"], deploy: [], release: [], piloto: [] };

const MIGRATE = "node scripts/esteira/migrate.mjs";
/** O build passa a migrar antes do next build (a migração só roda na Vercel com ESTEIRA_MIGRATE=1). */
export function withMigrateBuild(build) {
  if (!build) return `${MIGRATE} && next build`;
  if (build.includes(MIGRATE)) return build;
  return `${MIGRATE} && ${build}`;
}

export function patchNextConfig(src) {
  if (src.includes("serverExternalPackages")) {
    if (src.includes("@electric-sql/pglite")) return src;
    return src.replace(/serverExternalPackages:\s*\[/, 'serverExternalPackages: ["@electric-sql/pglite", ');
  }
  const m = /const nextConfig(?::\s*NextConfig)?\s*=\s*\{/.exec(src) ?? /export default\s*(?:\(\s*)?\{/.exec(src);
  if (!m) throw new Error("Não reconheci o next.config para adicionar serverExternalPackages.");
  const at = m.index + m[0].length;
  return src.slice(0, at) + '\n  serverExternalPackages: ["@electric-sql/pglite"],' + src.slice(at);
}

const normalize = (s) => s.replace(/\r\n/g, "\n").trim();

/**
 * Atualiza um workflow da esteira no produto: cria se não existe, troca se ainda é uma versão antiga
 * SEM customização (igual a um template legado), mantém se já é o atual ou se tem o que precisa (keepIf),
 * e só avisa se foi customizado — nunca sobrescreve trabalho da pessoa.
 */
export function upgradeWorkflow(current, { latest, legacy, keepIf, note }) {
  const content = readFileSync(join(T, "workflows", latest), "utf8");
  if (current == null) return { action: "create", content };
  if (normalize(current) === normalize(content)) return { action: "keep" };
  if (legacy.some((l) => normalize(current) === normalize(readFileSync(join(T, "workflows/legacy", l), "utf8")))) return { action: "upgrade", content };
  if (keepIf(current)) return { action: "keep" };
  return { action: "warn", note };
}

/** Decide o que fazer com o ci.yml do produto. */
export function upgradeCi(current) {
  return upgradeWorkflow(current, {
    latest: "ci.yml",
    legacy: ["ci-v1.yml", "ci-v2.yml"],
    keepIf: (c) => c.includes("test:e2e") && c.includes("traceability") && c.includes("workflow_dispatch"),
    note: "O ci.yml foi customizado: acrescente à mão os passos de teste, rastreabilidade e Playwright e o gatilho workflow_dispatch (veja o template da esteira em templates/app/workflows/ci.yml).",
  });
}

/** Decide o que fazer com o esteira-gates.yml do produto (a versão atual dispara o piloto). */
export function upgradeGates(current) {
  return upgradeWorkflow(current, {
    latest: "esteira-gates.yml",
    legacy: ["esteira-gates-v1.yml"],
    keepIf: (c) => c.includes("esteira-piloto.yml"),
    note: "O esteira-gates.yml foi customizado: acrescente o disparo do piloto (gh workflow run esteira-piloto.yml) e a permissão actions: write (veja templates/app/workflows/esteira-gates.yml).",
  });
}

export function ensure(feature, opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!FILES[feature]) return { ok: false, error: `Camada desconhecida: ${feature}. Use db, tests, deploy, release ou piloto.` };
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return { ok: false, error: "Sem package.json: rode /esteira:setup antes." };

  const changed = [];
  const notes = [];

  // Valida o que pode falhar ANTES de escrever qualquer coisa (nada de repo pela metade).
  let nextConfigPatch = null;
  if (feature === "db") {
    const ncName = NEXT_CONFIGS.find((n) => existsSync(join(cwd, n)));
    if (ncName) {
      const before = readFileSync(join(cwd, ncName), "utf8");
      try { nextConfigPatch = { name: ncName, before, after: patchNextConfig(before) }; }
      catch (err) { return { ok: false, error: `${err.message} Adicione serverExternalPackages: ["@electric-sql/pglite"] em ${ncName} e rode de novo.` }; }
    } else notes.push('next.config não encontrado: adicione serverExternalPackages: ["@electric-sql/pglite"] à mão.');
  }
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
  if (feature === "deploy") scripts.build = withMigrateBuild(scripts.build);
  if (JSON.stringify(scripts) !== JSON.stringify(pkg.scripts)) { pkg.scripts = scripts; write("package.json", JSON.stringify(pkg, null, 2) + "\n"); }

  if (feature === "release" && !existsSync(join(cwd, ".release-please-manifest.json"))) {
    // A versão atual do app é o ponto de partida do release-please.
    write(".release-please-manifest.json", JSON.stringify({ ".": pkg.version ?? "0.1.0" }, null, 2) + "\n");
  }

  if (nextConfigPatch && nextConfigPatch.after !== nextConfigPatch.before) write(nextConfigPatch.name, nextConfigPatch.after);

  const applyUpgrade = (rel, fn) => {
    const abs = join(cwd, rel);
    const r = fn(existsSync(abs) ? readFileSync(abs, "utf8") : null);
    if (r.action === "create" || r.action === "upgrade") write(rel, r.content);
    if (r.action === "warn") notes.push(r.note);
  };
  if (feature === "tests" || feature === "piloto") applyUpgrade(".github/workflows/ci.yml", upgradeCi);
  if (feature === "piloto") applyUpgrade(".github/workflows/esteira-gates.yml", upgradeGates);

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
