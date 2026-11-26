// Utilitários compartilhados pelos scripts da esteira (sem dependências).
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export function run(cmd, args, cwd, { input } = {}) {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "").toString().trim(), err: (e.stderr ?? e.message ?? "").toString().trim() };
  }
}

export const git = (cwd, ...args) => run("git", args, cwd);

// gh real, ou falso quando ESTEIRA_FAKE_GH=<arquivo-de-log> (testes): registra a chamada e devolve respostas plausíveis.
let fakeCounter = 100;
export function gh(cwd, ...args) {
  const log = process.env.ESTEIRA_FAKE_GH;
  if (!log) return run("gh", args, cwd);
  appendFileSync(log, JSON.stringify(args) + "\n");
  const [a, b] = args;
  if (a === "--version" || (a === "repo" && b === "view")) return { ok: true, out: '{"nameWithOwner":"fake/produto"}' };
  if (a === "pr" && b === "list") return { ok: true, out: process.env.ESTEIRA_FAKE_GH_PRS ?? "[]" };
  if (a === "api") {
    // ESTEIRA_FAKE_GH_API: JSON { "<caminho da api>": resposta }
    const routes = JSON.parse(process.env.ESTEIRA_FAKE_GH_API ?? "{}");
    const path = args.find((x, i) => i > 0 && !x.startsWith("-")) ?? "";
    return path in routes ? { ok: true, out: JSON.stringify(routes[path]) } : { ok: false, out: "", err: `HTTP 404: ${path}` };
  }
  if (a === "pr" && b === "create") return { ok: true, out: "https://github.com/fake/produto/pull/1" };
  if (a === "issue" && b === "list") return { ok: true, out: process.env.ESTEIRA_FAKE_GH_ISSUES ?? "[]" };
  if (a === "issue" && b === "create") return { ok: true, out: `https://github.com/fake/produto/issues/${++fakeCounter}` };
  return { ok: true, out: "" };
}

export function defaultBranch(cwd) {
  const ref = git(cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (ref.ok && ref.out) return ref.out.replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(cwd, "rev-parse", "--verify", "--quiet", b).ok) return b;
  return "main";
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

export const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

export function print(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  process.exitCode = code;
}
