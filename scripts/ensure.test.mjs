import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensure, patchNextConfig, upgradeCi } from "./ensure.mjs";

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
};

export default nextConfig;
`;
const V1 = readFileSync(new URL("../templates/app/workflows/legacy/ci-v1.yml", import.meta.url), "utf8");
const V2 = readFileSync(new URL("../templates/app/workflows/ci.yml", import.meta.url), "utf8");

function app() {
  const dir = mkdtempSync(join(tmpdir(), "esteira-ensure-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", scripts: { dev: "next dev" }, dependencies: { next: "16.4.6" } }, null, 2));
  writeFileSync(join(dir, "next.config.ts"), NEXT_CONFIG);
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".github/workflows/ci.yml"), V1);
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  return dir;
}
const read = (dir, p) => readFileSync(join(dir, p), "utf8");

test("next.config recebe serverExternalPackages, sem duplicar e respeitando lista existente", () => {
  const out = patchNextConfig(NEXT_CONFIG);
  assert.match(out, /const nextConfig: NextConfig = \{\n  serverExternalPackages: \["@electric-sql\/pglite"\],/);
  assert.equal(patchNextConfig(out), out);
  assert.match(patchNextConfig('const nextConfig = {\n  serverExternalPackages: ["sharp"],\n};'), /\["@electric-sql\/pglite", "sharp"\]/);
  assert.throws(() => patchNextConfig("module.exports = require('./x');"), /Não reconheci/);
});

test("ci.yml: cria, atualiza o v1 da esteira, mantém o v2 e não toca em customizado", () => {
  assert.equal(upgradeCi(null).action, "create");
  assert.equal(upgradeCi(V1).action, "upgrade");
  assert.equal(upgradeCi(V1.replace(/\n/g, "\r\n")).action, "upgrade", "CRLF do Windows");
  assert.equal(upgradeCi(V2).action, "keep");
  assert.equal(upgradeCi(V1 + "\n  extra:\n    runs-on: x\n").action, "warn");
});

test("ensure db: arquivos, script, next.config e .gitignore; sem rota de reset enquanto não há testes", () => {
  const dir = app();
  const r = ensure("db", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  for (const p of ["src/db/index.ts", "src/db/local.ts", "src/db/schema.ts", "src/db/testing.ts", "drizzle.config.ts"]) assert.ok(existsSync(join(dir, p)), p);
  assert.equal(existsSync(join(dir, "src/app/api/e2e/reset/route.ts")), false);
  assert.equal(JSON.parse(read(dir, "package.json")).scripts["db:generate"], "drizzle-kit generate");
  assert.match(read(dir, "next.config.ts"), /serverExternalPackages/);
  assert.match(read(dir, ".gitignore"), /\.esteira\//);
  assert.ok(r.paths.includes("next.config.ts"));
});

test("ensure tests depois de db: rota de reset, scripts, CI v2 e gitignore de relatórios", () => {
  const dir = app();
  ensure("db", { cwd: dir, "skip-install": true });
  const r = ensure("tests", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  for (const p of ["vitest.config.ts", "playwright.config.ts", "e2e/support.ts", "scripts/esteira/traceability.mjs", "src/app/api/e2e/reset/route.ts"]) assert.ok(existsSync(join(dir, p)), p);
  const s = JSON.parse(read(dir, "package.json")).scripts;
  assert.equal(s.test, "vitest run");
  assert.equal(s["test:e2e"], "playwright test");
  assert.match(read(dir, ".github/workflows/ci.yml"), /test:e2e/);
  assert.match(read(dir, ".gitignore"), /test-results\//);
});

test("ensure é idempotente e não sobrescreve arquivo do produto", () => {
  const dir = app();
  ensure("db", { cwd: dir, "skip-install": true });
  writeFileSync(join(dir, "src/db/schema.ts"), "export const minhaTabela = 1;\n");
  const r = ensure("db", { cwd: dir, "skip-install": true });
  assert.deepEqual(r.changed, []);
  assert.equal(read(dir, "src/db/schema.ts"), "export const minhaTabela = 1;\n");
});

test("camada desconhecida e repo sem app dão erro", () => {
  assert.equal(ensure("xyz", { cwd: app() }).ok, false);
  assert.match(ensure("db", { cwd: mkdtempSync(join(tmpdir(), "esteira-ensure-vazio-")) }).error, /setup/);
});

test("revisão F3: next.config com export default direto e .mjs são aceitos", () => {
  assert.match(patchNextConfig("export default {\n  reactStrictMode: true,\n};\n"), /export default \{\n  serverExternalPackages: \["@electric-sql\/pglite"\],/);
  const dir = app();
  writeFileSync(join(dir, "next.config.mjs"), "export default {\n};\n");
  rmSync(join(dir, "next.config.ts"));
  const r = ensure("db", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  assert.match(read(dir, "next.config.mjs"), /serverExternalPackages/);
});

test("revisão F3: next.config irreconhecível falha ANTES de escrever qualquer arquivo", () => {
  const dir = app();
  writeFileSync(join(dir, "next.config.ts"), "module.exports = require('./outra-config');\n");
  const r = ensure("db", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, false);
  assert.match(r.error, /serverExternalPackages/);
  assert.equal(existsSync(join(dir, "src/db/index.ts")), false);
  assert.equal(JSON.parse(read(dir, "package.json")).scripts["db:generate"], undefined);
});

test("F4: ensure deploy — migrate.mjs, runbook e build que migra antes (idempotente)", () => {
  const dir = app();
  const pkg = JSON.parse(read(dir, "package.json"));
  pkg.scripts.build = "next build";
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  const r = ensure("deploy", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  assert.ok(existsSync(join(dir, "scripts/esteira/migrate.mjs")));
  assert.match(read(dir, "docs/deploy.md"), /## Rollback/);
  assert.equal(JSON.parse(read(dir, "package.json")).scripts.build, "node scripts/esteira/migrate.mjs && next build");
  ensure("deploy", { cwd: dir, "skip-install": true });
  assert.equal(JSON.parse(read(dir, "package.json")).scripts.build, "node scripts/esteira/migrate.mjs && next build");
});

test("F4: ensure release — workflow, config e manifest com a versão do app", () => {
  const dir = app();
  const pkg = JSON.parse(read(dir, "package.json"));
  pkg.version = "0.3.0";
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  const r = ensure("release", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  assert.match(read(dir, ".github/workflows/release-please.yml"), /release-please-action@v5/);
  assert.equal(JSON.parse(read(dir, "release-please-config.json")).packages["."]["release-type"], "node");
  assert.deepEqual(JSON.parse(read(dir, ".release-please-manifest.json")), { ".": "0.3.0" });
  assert.ok(r.paths.includes(".release-please-manifest.json"));
});

test("dry-run F6: release-please sem prefixo de componente na tag (v0.2.0, não app-v0.2.0)", () => {
  const cfg = JSON.parse(readFileSync(new URL("../templates/app/release-please-config.json", import.meta.url), "utf8"));
  assert.equal(cfg.packages["."]["include-component-in-tag"], false);
});

test("F5: ensure piloto — workflow do piloto, gates v1 → v2 e CI v2 → v3 (com workflow_dispatch)", () => {
  const dir = app();
  const legacy = (f) => readFileSync(new URL(`../templates/app/workflows/legacy/${f}`, import.meta.url), "utf8");
  writeFileSync(join(dir, ".github/workflows/ci.yml"), legacy("ci-v2.yml"));
  writeFileSync(join(dir, ".github/workflows/esteira-gates.yml"), legacy("esteira-gates-v1.yml"));
  const r = ensure("piloto", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  assert.match(read(dir, ".github/workflows/esteira-piloto.yml"), /anthropics\/claude-code-action@v1/);
  assert.match(read(dir, ".github/workflows/esteira-gates.yml"), /gh workflow run esteira-piloto\.yml/);
  assert.match(read(dir, ".github/workflows/ci.yml"), /workflow_dispatch:/);
  assert.deepEqual(r.notes, []);
});

test("F5: gates e CI customizados não são sobrescritos (só aviso)", () => {
  const dir = app();
  writeFileSync(join(dir, ".github/workflows/ci.yml"), "name: ci\n# meu CI\n");
  writeFileSync(join(dir, ".github/workflows/esteira-gates.yml"), "name: esteira-gates\n# meu\n");
  const r = ensure("piloto", { cwd: dir, "skip-install": true });
  assert.equal(read(dir, ".github/workflows/ci.yml"), "name: ci\n# meu CI\n");
  assert.equal(read(dir, ".github/workflows/esteira-gates.yml"), "name: esteira-gates\n# meu\n");
  assert.equal(r.notes.length, 2);
});

test("dry-run F5: piloto v1 e v2 são atualizados; o atual libera só o bot github-actions e usa o token do piloto", () => {
  const dir = app();
  const v1 = readFileSync(new URL("../templates/app/workflows/legacy/esteira-piloto-v1.yml", import.meta.url), "utf8");
  writeFileSync(join(dir, ".github/workflows/esteira-piloto.yml"), v1);
  const r = ensure("piloto", { cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  const wf = read(dir, ".github/workflows/esteira-piloto.yml");
  assert.equal((wf.match(/allowed_bots: github-actions/g) || []).length, 3);
  assert.doesNotMatch(wf, /allowed_bots: "\*"|allowed_bots: \*/);
  assert.match(wf, /ESTEIRA_PILOTO_TOKEN/);
  assert.match(wf, /name: Esperar o CI do PR[\s\S]*name: Review/);
  const v2 = readFileSync(new URL("../templates/app/workflows/legacy/esteira-piloto-v2.yml", import.meta.url), "utf8");
  writeFileSync(join(dir, ".github/workflows/esteira-piloto.yml"), v2);
  ensure("piloto", { cwd: dir, "skip-install": true });
  assert.match(read(dir, ".github/workflows/esteira-piloto.yml"), /ESTEIRA_PILOTO_TOKEN/);
});
