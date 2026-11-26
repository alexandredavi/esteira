#!/usr/bin/env node
// Rastreabilidade da esteira: todo critério de aceite (AC) de uma story em desenvolvimento precisa de um
// teste de aceite com o ID no título. Roda no CI do produto; instalado por /esteira:testes.
//
// node scripts/esteira/traceability.mjs [--json]
//
// - Specs: docs/specs/*.md. ACs: cabeçalhos "#### AC-<issue>.<n> — título". Status no frontmatter.
// - Exigidas: specs com status "dev" ou "done" (a partir do /esteira:dev).
// - Testes: e2e/**/*.spec.ts. Conta test("AC-12.1 — …") e test.only(…). test.skip/test.fixme NÃO cobrem.
// - Falha (exit 1) se faltar teste para AC exigido ou se um teste citar AC que não existe.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const AC_HEADING = /^####\s+(AC-\d+\.\d+)\b/gm;
const AC_ID = /AC-\d+\.\d+/g;
const REQUIRED = new Set(["dev", "done"]);

export function parseSpec(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(fm)?.[1].trim() ?? null;
  return {
    issue: field("issue") ? Number(field("issue")) : null,
    status: field("status") ?? "backlog",
    acs: [...text.matchAll(AC_HEADING)].map((m) => m[1]),
  };
}

// Títulos dos testes: test("…") / test.only("…") contam; test.skip / test.fixme ficam em "skipped".
export function parseTests(text) {
  const counted = [];
  const skipped = [];
  const re = /\btest(\.only|\.skip|\.fixme)?\(\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
  for (const m of text.matchAll(re)) {
    const ids = m[3].match(AC_ID) ?? [];
    (m[1] === ".skip" || m[1] === ".fixme" ? skipped : counted).push(...ids);
  }
  return { counted, skipped };
}

export function analyze(specs, tests) {
  const known = new Map();
  for (const s of specs) for (const ac of s.acs) known.set(ac, s);
  const covered = new Map();
  const skipped = new Set();
  for (const t of tests) {
    for (const id of t.counted) covered.set(id, [...(covered.get(id) ?? []), t.file]);
    for (const id of t.skipped) skipped.add(id);
  }
  const required = specs.filter((s) => REQUIRED.has(s.status));
  const missing = required.flatMap((s) => s.acs.filter((ac) => !covered.has(ac)).map((ac) => ({ ac, spec: s.file, skipped: skipped.has(ac) })));
  const unknown = [...covered.keys()].filter((id) => !known.has(id)).map((ac) => ({ ac, tests: covered.get(ac) }));
  return {
    ok: missing.length === 0 && unknown.length === 0,
    required: required.map((s) => ({ spec: s.file, status: s.status, acs: s.acs.length, covered: s.acs.filter((a) => covered.has(a)).length })),
    missing,
    unknown,
  };
}

function walk(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p, pred, out); }
    else if (pred(name)) out.push(p);
  }
  return out;
}

export function run(cwd) {
  const specs = walk(join(cwd, "docs/specs"), (n) => n.endsWith(".md"))
    .map((p) => ({ file: relative(cwd, p).replace(/\\/g, "/"), ...parseSpec(readFileSync(p, "utf8")) }));
  const tests = walk(join(cwd, "e2e"), (n) => n.endsWith(".spec.ts"))
    .map((p) => ({ file: relative(cwd, p).replace(/\\/g, "/"), ...parseTests(readFileSync(p, "utf8")) }));
  return analyze(specs, tests);
}

function report(r) {
  const lines = ["Rastreabilidade AC → teste"];
  if (!r.required.length) lines.push("  Nenhuma story em desenvolvimento (status dev/done): nada exigido.");
  for (const s of r.required) lines.push(`  ${s.covered === s.acs ? "✔" : "✖"} ${s.spec} — ${s.covered}/${s.acs} ACs com teste`);
  for (const m of r.missing) lines.push(`  ✖ ${m.ac} (${m.spec}) sem teste de aceite${m.skipped ? " — só há test.skip/fixme, que não conta" : ""}`);
  for (const u of r.unknown) lines.push(`  ✖ ${u.ac} citado em ${u.tests.join(", ")} não existe em nenhuma spec`);
  lines.push(r.ok ? "OK" : "FALHOU: todo AC de story em desenvolvimento precisa de um teste com o ID no título.");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const r = run(process.cwd());
  process.stdout.write((process.argv.includes("--json") ? JSON.stringify(r, null, 2) : report(r)) + "\n");
  process.exitCode = r.ok ? 0 : 1;
}
