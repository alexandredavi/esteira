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
