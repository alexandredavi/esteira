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
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, print } from "./lib.mjs";

export const VERSIONS = { "create-next-app": "16.4.6", shadcn: "4.23.1" };
export const UI_COMPONENTS = ["button", "card", "input", "label", "badge", "table", "dialog", "select", "textarea", "sonner", "skeleton", "separator", "tabs", "alert", "dropdown-menu", "tooltip"];
const TEMPLATES = fileURLToPath(new URL("../templates/app/", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".git"]);

// No Windows, npx/npm são .cmd e precisam de shell; monta a linha com aspas em vez de passar a lista (DEP0190).
const quote = (a) => (/^[\w@./:=*-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
export function sh(cmd, args, cwd) {
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

/** Nome de pacote npm válido a partir do nome da pasta do repo. */
export function packageName(dir) {
  const n = String(dir).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "");
  return n || "app";
}

export function addScripts(pkg) {
  // next typegen gera os tipos de rota (LayoutProps, PageProps) que o tsc precisa antes do primeiro build.
  pkg.scripts = { ...pkg.scripts, typecheck: pkg.scripts?.typecheck ?? "next typegen && tsc --noEmit" };
  return pkg;
}

// Copia src → dst sem sobrescrever.
function mergeTree(src, dst) {
  for (const name of readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(name.name)) continue;
    const from = join(src, name.name);
    const to = join(dst, name.name);
    if (name.isDirectory()) {
      if (!existsSync(to)) cpSync(from, to, { recursive: true });
      else mergeTree(from, to);
    } else if (!existsSync(to)) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

function writeIfMissing(cwd, rel, content) {
  const abs = join(cwd, rel);
  if (existsSync(abs)) return false;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return true;
}

// Tudo o que o setup cria ou altera no repo: é o que vai para o commit do gate (filtrado pelo que existe).
export const SETUP_PATHS = [
  ".github/workflows/ci.yml", ".github/workflows/esteira-gates.yml", ".gitignore", "AGENTS.md", "CLAUDE.md",
  "components.json", "eslint-rules", "eslint.config.mjs", "next.config.ts", "package.json",
  "package-lock.json", "postcss.config.mjs", "public", "src", "tsconfig.json",
];

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const isNextApp = (pkg) => Boolean(pkg?.dependencies?.next ?? pkg?.devDependencies?.next);

/** O que ainda falta num repo (vazio = setup completo). */
export function missingParts(cwd) {
  const missing = [];
  const pkg = readJson(join(cwd, "package.json"));
  if (!pkg) return ["app"];
  if (!pkg.scripts?.typecheck) missing.push("typecheck");
  if (!existsSync(join(cwd, "eslint-rules/esteira-ds.mjs"))) missing.push("regra do DS");
  const eslint = join(cwd, "eslint.config.mjs");
  if (!existsSync(eslint) || !readFileSync(eslint, "utf8").includes("esteira-ds")) missing.push("ESLint com a regra do DS");
  for (const wf of ["ci.yml", "esteira-gates.yml"]) if (!existsSync(join(cwd, ".github/workflows", wf))) missing.push(`workflow ${wf}`);
  if (!existsSync(join(cwd, "node_modules"))) missing.push("dependências");
  if (!existsSync(join(cwd, "components.json"))) missing.push("shadcn");
  return missing;
}

const pathsIn = (cwd) => SETUP_PATHS.filter((p) => existsSync(join(cwd, p)));

export function setup(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const steps = [];
  const fail = (error) => ({ ok: false, error, steps, paths: pathsIn(cwd), resumable: existsSync(join(cwd, "package.json")) });
  const pkgPath = join(cwd, "package.json");
  const existing = readJson(pkgPath);
  if (existsSync(pkgPath) && !isNextApp(existing)) {
    return { ok: false, error: "Já existe um package.json que não é de um app Next.js. O setup da esteira não se aplica a este repo." };
  }
  const missing = missingParts(cwd);
  if (missing.length === 0) return { ok: true, already: true, reason: "O app já está montado e completo. Nada a fazer.", paths: pathsIn(cwd) };
  const resumed = Boolean(existing);
  if (resumed) steps.push(`retomando um setup incompleto (faltava: ${missing.join(", ")})`);

  // 1. Next.js num diretório temporário (o create-next-app recusa diretórios com arquivos que não conhece).
  if (!existing) {
    const tmp = mkdtempSync(join(tmpdir(), "esteira-setup-"));
    try {
      const app = join(tmp, "app");
      const cna = sh("npx", ["--yes", `create-next-app@${VERSIONS["create-next-app"]}`, app,
        "--ts", "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--use-npm",
        "--yes", "--disable-git", "--no-agent-feedback", "--empty", "--skip-install"], tmp);
      if (!cna.ok) return fail(`create-next-app falhou: ${cna.err.slice(-800)}`);
      steps.push(`create-next-app@${VERSIONS["create-next-app"]}`);

      // 2. Mescla no repo sem sobrescrever; .gitignore é unido.
      const gi = join(cwd, ".gitignore");
      const incomingGi = existsSync(join(app, ".gitignore")) ? readFileSync(join(app, ".gitignore"), "utf8") : "";
      const currentGi = existsSync(gi) ? readFileSync(gi, "utf8") : "";
      mergeTree(app, cwd);
      writeFileSync(gi, mergeGitignore(currentGi, incomingGi));
      steps.push("app mesclado no repo");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // 3. Script de typecheck (idempotente).
  const pkgJson = addScripts(JSON.parse(readFileSync(pkgPath, "utf8")));
  // O create-next-app gerou numa pasta temporária "app": o pacote leva o nome do repo (vai para a release).
  if (pkgJson.name === "app") pkgJson.name = packageName(basename(cwd));
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + "\n");

  // 4. Regra de lint do Design System (idempotente).
  writeIfMissing(cwd, "eslint-rules/esteira-ds.mjs", readFileSync(join(TEMPLATES, "eslint-rules/esteira-ds.mjs"), "utf8"));
  const eslintPath = join(cwd, "eslint.config.mjs");
  if (!existsSync(eslintPath)) return fail("eslint.config.mjs não encontrado: o app não foi gerado com --eslint.");
  writeFileSync(eslintPath, patchEslintConfig(readFileSync(eslintPath, "utf8")));
  steps.push("regra esteira-ds/no-raw-styles registrada no ESLint");

  // 5. Workflows: CI e labels dos gates (não sobrescreve).
  for (const wf of ["ci.yml", "esteira-gates.yml"]) {
    writeIfMissing(cwd, `.github/workflows/${wf}`, readFileSync(join(TEMPLATES, "workflows", wf), "utf8"));
  }
  steps.push("workflows ci.yml e esteira-gates.yml");

  // 6. Dependências e shadcn/ui. Cada passo é idempotente: rodar de novo depois de uma falha completa o que faltou.
  if (!opts["skip-install"]) {
    const install = sh("npm", ["install", "--no-audit", "--no-fund"], cwd);
    if (!install.ok) return fail(`npm install falhou: ${install.err.slice(-800)}. Rode /esteira:setup de novo para retomar.`);
    steps.push("npm install");
    if (!existsSync(join(cwd, "components.json"))) {
      const init = sh("npx", ["--yes", `shadcn@${VERSIONS.shadcn}`, "init", "-d", "-y"], cwd);
      if (!init.ok) return fail(`shadcn init falhou: ${init.err.slice(-800)}. Rode /esteira:setup de novo para retomar.`);
    }
    const add = sh("npx", ["--yes", `shadcn@${VERSIONS.shadcn}`, "add", ...UI_COMPONENTS, "-y"], cwd);
    if (!add.ok) return fail(`shadcn add falhou: ${add.err.slice(-800)}. Rode /esteira:setup de novo para retomar.`);
    steps.push(`shadcn@${VERSIONS.shadcn} init + ${UI_COMPONENTS.length} componentes`);
  }

  return { ok: true, already: false, resumed, versions: VERSIONS, steps, paths: pathsIn(cwd), components: UI_COMPONENTS };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = setup(parseArgs(process.argv.slice(2))); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
