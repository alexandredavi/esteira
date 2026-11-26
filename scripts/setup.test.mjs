import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGitignore, patchEslintConfig, addScripts, setup } from "./setup.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
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

test("repo que já tem package.json não é tocado", () => {
  const dir = mkdtempSync(join(tmpdir(), "esteira-setup-t-"));
  writeFileSync(join(dir, "package.json"), "{}");
  assert.deepEqual(setup({ cwd: dir }).already, true);
});
