import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGitignore, patchEslintConfig, addScripts, setup, missingParts } from "./setup.mjs";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NEXT_ESLINT = `import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**"]),
]);

export default eslintConfig;
`;

test("eslint.config.mjs do Next 16 recebe import e bloco da regra", () => {
  const out = patchEslintConfig(NEXT_ESLINT);
  assert.match(out, /import nextTs from "eslint-config-next\/typescript";\nimport esteiraDs from "\.\/eslint-rules\/esteira-ds\.mjs";/);
  assert.match(out, /\.\.\.nextTs,\n  esteiraDs,/);
  assert.equal(patchEslintConfig(out), out, "idempotente");
});

test("formato sem nextTs cai no início do defineConfig; formato desconhecido é erro", () => {
  assert.match(patchEslintConfig(`import { defineConfig } from "eslint/config";\nexport default defineConfig([\n  {}\n]);\n`), /defineConfig\(\[\n  esteiraDs,/);
  assert.throws(() => patchEslintConfig("export default [];"), /Não reconheci/);
});

test(".gitignore é unido sem duplicar e ganha .esteira/", () => {
  const out = mergeGitignore("node_modules\n.env\n", "# deps\n/node_modules\nnode_modules\n.next/\n.env\n");
  assert.match(out, /^node_modules\n\.env\n\n# esteira \/ Next\.js\n\/node_modules\n\.next\/\n\.esteira\/\n$/);
  assert.equal(mergeGitignore(out, "/node_modules\n"), out);
  assert.equal(mergeGitignore("", ""), "# esteira / Next.js\n.esteira/\n");
});

test("script de typecheck é adicionado sem apagar os outros", () => {
  assert.deepEqual(addScripts({ scripts: { dev: "next dev" } }).scripts, { dev: "next dev", typecheck: "next typegen && tsc --noEmit" });
  assert.equal(addScripts({ scripts: { typecheck: "x" } }).scripts.typecheck, "x");
});

test("package.json que não é de Next é recusado", () => {
  const dir = mkdtempSync(join(tmpdir(), "esteira-setup-t-"));
  writeFileSync(join(dir, "package.json"), "{}");
  const r = setup({ cwd: dir });
  assert.equal(r.ok, false);
  assert.match(r.error, /não é de um app Next/);
});

// App Next "pela metade": como fica se npm install ou shadcn falharam depois da mescla.
function halfApp() {
  const dir = mkdtempSync(join(tmpdir(), "esteira-setup-half-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", scripts: { dev: "next dev" }, dependencies: { next: "16.4.6" } }));
  writeFileSync(join(dir, "eslint.config.mjs"), NEXT_ESLINT);
  mkdirSync(join(dir, "src/app"), { recursive: true });
  writeFileSync(join(dir, "src/app/page.tsx"), "export default function P() { return null }\n");
  return dir;
}

test("revisão F2: setup incompleto é retomado (não vira already) e devolve os paths para o gate", () => {
  const dir = halfApp();
  assert.deepEqual(missingParts(dir), ["typecheck", "regra do DS", "ESLint com a regra do DS", "workflow ci.yml", "workflow esteira-gates.yml", "dependências", "shadcn"]);
  const r = setup({ cwd: dir, "skip-install": true });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.already, false);
  assert.equal(r.resumed, true);
  assert.match(r.steps[0], /retomando/);
  assert.ok(existsSync(join(dir, "eslint-rules/esteira-ds.mjs")));
  assert.match(readFileSync(join(dir, "eslint.config.mjs"), "utf8"), /esteiraDs,/);
  assert.deepEqual(r.paths, [".github/workflows/ci.yml", ".github/workflows/esteira-gates.yml", "eslint-rules", "eslint.config.mjs", "package.json", "src"]);
});

test("revisão F2: app completo é already, com os paths", () => {
  const dir = halfApp();
  setup({ cwd: dir, "skip-install": true });
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "components.json"), "{}");
  const r = setup({ cwd: dir });
  assert.equal(r.already, true);
  assert.ok(r.paths.includes("components.json"));
});
