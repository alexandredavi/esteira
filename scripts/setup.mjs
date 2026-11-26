#!/usr/bin/env node
// Monta o app do produto no repo: Next.js (App Router, TS, Tailwind, ESLint) + shadcn/ui
// + regra de lint do Design System + workflows de CI e de labels dos gates.
//
// node setup.mjs [--cwd repo] [--skip-install]
//
// Nunca sobrescreve o que já existe no repo (README, docs/, .gitignore é mesclado).
// Imprime JSON com o que foi feito e os caminhos para o gate.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, print } from "./lib.mjs";

export const VERSIONS = { "create-next-app": "16.4.6", shadcn: "4.23.1" };
export const UI_COMPONENTS = ["button", "card", "input", "label", "badge", "table", "dialog", "select", "textarea", "sonner", "skeleton", "separator", "tabs", "alert", "dropdown-menu", "tooltip"];
const TEMPLATES = fileURLToPath(new URL("../templates/app/", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".git"]);

// No Windows, npx/npm são .cmd e precisam de shell; monta a linha com aspas em vez de passar a lista (DEP0190).
const quote = (a) => (/^[\w@./:=*-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
function sh(cmd, args, cwd) {
  const opts = { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  const r = process.platform === "win32"
    ? spawnSync([cmd, ...args].map(quote).join(" "), { ...opts, shell: true })
    : spawnSync(cmd, args, opts);
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: ((r.stderr ?? "") + (r.error?.message ?? "")).trim() };
}

export function mergeGitignore(current, incoming, extra = [".esteira/"]) {
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const add = [...incoming.split(/\r?\n/), ...extra].map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !have.has(l));
  const unique = [...new Set(add)];
  if (!unique.length) return current;
  return `${current.trimEnd()}${current.trim() ? "\n\n" : ""}# esteira / Next.js\n${unique.join("\n")}\n`;
}

export function patchEslintConfig(src) {
  if (src.includes("esteira-ds")) return src;
  const importLine = `import esteiraDs from "./eslint-rules/esteira-ds.mjs";\n`;
  const lastImport = [...src.matchAll(/^import .*;[ \t]*$/gm)].pop();
  const withImport = lastImport
    ? src.slice(0, lastImport.index + lastImport[0].length) + "\n" + importLine.trimEnd() + src.slice(lastImport.index + lastImport[0].length)
    : importLine + src;
  if (/\.\.\.nextTs,/.test(withImport)) return withImport.replace(/(\.\.\.nextTs,)/, "$1\n  esteiraDs,");
  if (/defineConfig\(\[/.test(withImport)) return withImport.replace(/defineConfig\(\[/, "defineConfig([\n  esteiraDs,");
  throw new Error("Não reconheci o formato do eslint.config.mjs para registrar a regra do DS.");
}

export function addScripts(pkg) {
  // next typegen gera os tipos de rota (LayoutProps, PageProps) que o tsc precisa antes do primeiro build.
  pkg.scripts = { ...pkg.scripts, typecheck: pkg.scripts?.typecheck ?? "next typegen && tsc --noEmit" };
  return pkg;
}

// Copia src → dst sem sobrescrever; devolve os caminhos de primeiro nível criados.
function mergeTree(src, dst, created = new Set(), top = true) {
  for (const name of readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(name.name)) continue;
    const from = join(src, name.name);
    const to = join(dst, name.name);
    if (name.isDirectory()) {
      if (!existsSync(to)) { cpSync(from, to, { recursive: true }); if (top) created.add(name.name); }
      else mergeTree(from, to, created, false);
    } else if (!existsSync(to)) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
      if (top) created.add(name.name);
    }
  }
  return created;
}

function writeIfMissing(cwd, rel, content, created) {
  const abs = join(cwd, rel);
  if (existsSync(abs)) return false;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  created.add(rel);
  return true;
}

export function setup(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (existsSync(join(cwd, "package.json"))) {
    return { ok: true, already: true, reason: "Já existe package.json: o app já foi montado. Nada a fazer." };
  }
  const steps = [];
  const created = new Set();

  // 1. Next.js num diretório temporário (o create-next-app recusa diretórios com arquivos que não conhece).
  const tmp = mkdtempSync(join(tmpdir(), "esteira-setup-"));
  const app = join(tmp, "app");
  const cna = sh("npx", ["--yes", `create-next-app@${VERSIONS["create-next-app"]}`, app,
    "--ts", "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--use-npm",
    "--yes", "--disable-git", "--no-agent-feedback", "--empty", "--skip-install"], tmp);
  if (!cna.ok) return { ok: false, error: `create-next-app falhou: ${cna.err.slice(-800)}` };
  steps.push(`create-next-app@${VERSIONS["create-next-app"]}`);

  // 2. Mescla no repo sem sobrescrever; .gitignore é unido.
  const gi = join(cwd, ".gitignore");
  const incomingGi = existsSync(join(app, ".gitignore")) ? readFileSync(join(app, ".gitignore"), "utf8") : "";
  const currentGi = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  mergeTree(app, cwd, created);
  writeFileSync(gi, mergeGitignore(currentGi, incomingGi));
  created.add(".gitignore");
  rmSync(tmp, { recursive: true, force: true });
  steps.push("app mesclado no repo");

  // 3. Script de typecheck.
  const pkgPath = join(cwd, "package.json");
  writeFileSync(pkgPath, JSON.stringify(addScripts(JSON.parse(readFileSync(pkgPath, "utf8"))), null, 2) + "\n");

  // 4. Regra de lint do Design System.
  writeIfMissing(cwd, "eslint-rules/esteira-ds.mjs", readFileSync(join(TEMPLATES, "eslint-rules/esteira-ds.mjs"), "utf8"), created);
  const eslintPath = join(cwd, "eslint.config.mjs");
  writeFileSync(eslintPath, patchEslintConfig(readFileSync(eslintPath, "utf8")));
  steps.push("regra esteira-ds/no-raw-styles registrada no ESLint");

  // 5. Workflows: CI e labels dos gates.
  for (const wf of ["ci.yml", "esteira-gates.yml"]) {
    writeIfMissing(cwd, `.github/workflows/${wf}`, readFileSync(join(TEMPLATES, "workflows", wf), "utf8"), created);
  }
  steps.push("workflows ci.yml e esteira-gates.yml");

  // 6. Dependências e shadcn/ui.
  if (!opts["skip-install"]) {
    const install = sh("npm", ["install", "--no-audit", "--no-fund"], cwd);
    if (!install.ok) return { ok: false, error: `npm install falhou: ${install.err.slice(-800)}`, steps };
    steps.push("npm install");
    const init = sh("npx", ["--yes", `shadcn@${VERSIONS.shadcn}`, "init", "-d", "-y"], cwd);
    if (!init.ok) return { ok: false, error: `shadcn init falhou: ${init.err.slice(-800)}`, steps };
    const add = sh("npx", ["--yes", `shadcn@${VERSIONS.shadcn}`, "add", ...UI_COMPONENTS, "-y"], cwd);
    if (!add.ok) return { ok: false, error: `shadcn add falhou: ${add.err.slice(-800)}`, steps };
    steps.push(`shadcn@${VERSIONS.shadcn} init + ${UI_COMPONENTS.length} componentes`);
    created.add("components.json");
    created.add("package-lock.json");
  }

  const paths = [...created].map((p) => p.replace(/\\/g, "/")).filter((p) => existsSync(join(cwd, p))).sort();
  return { ok: true, already: false, versions: VERSIONS, steps, paths, components: UI_COMPONENTS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = setup(parseArgs(process.argv.slice(2))); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
