import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, parseTests, analyze, run } from "../templates/app/esteira/traceability.mjs";

const spec = (issue, status, acs) => `---\nissue: ${issue}\nepic: 2\nslug: x\nstatus: ${status}\n---\n\n# #${issue}\n\n${acs.map((a) => `#### ${a} — título\n\n\`\`\`gherkin\nCenário: x\n\`\`\``).join("\n\n")}\n`;

test("parseSpec lê issue, status e ACs (status ausente = backlog)", () => {
  assert.deepEqual(parseSpec(spec(12, "dev", ["AC-12.1", "AC-12.2"])), { issue: 12, status: "dev", acs: ["AC-12.1", "AC-12.2"] });
  assert.equal(parseSpec("---\nissue: 3\n---\n").status, "backlog");
  assert.deepEqual(parseSpec("texto citando AC-9.1 fora de cabeçalho").acs, []);
});

test("parseTests: test e test.only contam; skip e fixme não; aspas e crases; vários IDs", () => {
  const src = `
    test("AC-12.1 — inicia", async () => {});
    test.only('AC-12.2 e AC-12.3 — para', async () => {});
    test(\`AC-12.4 — vazio\`, async () => {});
    test.skip("AC-12.5 — depois", async () => {});
    test.fixme("AC-12.6 — quebrado", async () => {});
    test.describe("AC-12.7 — describe não conta", () => {});
    test("sem id", async () => {});
  `;
  assert.deepEqual(parseTests(src), { counted: ["AC-12.1", "AC-12.2", "AC-12.3", "AC-12.4"], skipped: ["AC-12.5", "AC-12.6"] });
});

test("só specs em dev/done são exigidas", () => {
  const r = analyze(
    [{ file: "a.md", status: "spec", acs: ["AC-1.1"] }, { file: "b.md", status: "dev", acs: ["AC-2.1", "AC-2.2"] }],
    [{ file: "e2e/2.spec.ts", counted: ["AC-2.1"], skipped: ["AC-2.2"] }],
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [{ ac: "AC-2.2", spec: "b.md", skipped: true }]);
  assert.deepEqual(r.required, [{ spec: "b.md", status: "dev", acs: 2, covered: 1 }]);
});

test("teste citando AC inexistente falha; tudo coberto passa", () => {
  assert.deepEqual(analyze([{ file: "b.md", status: "done", acs: ["AC-2.1"] }], [{ file: "t", counted: ["AC-2.1", "AC-9.9"], skipped: [] }]).unknown, [{ ac: "AC-9.9", tests: ["t"] }]);
  assert.equal(analyze([{ file: "b.md", status: "dev", acs: ["AC-2.1"] }], [{ file: "t", counted: ["AC-2.1"], skipped: [] }]).ok, true);
  assert.equal(analyze([], []).ok, true);
});

test("run lê docs/specs e e2e/ recursivo num repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "esteira-trace-"));
  mkdirSync(join(dir, "docs/specs"), { recursive: true });
  mkdirSync(join(dir, "e2e/sub"), { recursive: true });
  writeFileSync(join(dir, "docs/specs/10-timer.md"), spec(10, "dev", ["AC-10.1", "AC-10.2"]));
  writeFileSync(join(dir, "docs/specs/11-outra.md"), spec(11, "design", ["AC-11.1"]));
  writeFileSync(join(dir, "e2e/sub/10-timer.spec.ts"), 'test("AC-10.1 — x", () => {});\ntest("AC-10.2 — y", () => {});\n');
  const r = run(dir);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.required, [{ spec: "docs/specs/10-timer.md", status: "dev", acs: 2, covered: 2 }]);
});
