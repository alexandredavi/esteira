import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployStatus } from "./deploy-status.mjs";

const vercel = { login: "vercel[bot]" };
function repo(build = "node scripts/esteira/migrate.mjs && next build") {
  const dir = mkdtempSync(join(tmpdir(), "esteira-deploy-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build } }));
  return dir;
}

beforeEach(() => {
  process.env.ESTEIRA_FAKE_GH = join(mkdtempSync(join(tmpdir(), "esteira-ghlog-")), "gh.log");
  delete process.env.ESTEIRA_FAKE_GH_API;
  delete process.env.ESTEIRA_FAKE_GH_PRS;
});

test("produção e previews dos PRs abertos, com o estado mais recente", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    // A lista geral recente só tem previews de outros PRs: produção e o PR antigo vêm das consultas filtradas.
    "repos/{owner}/{repo}/deployments?per_page=10": [
      { id: 9, sha: "9999999111", ref: "feat/99-outro", environment: "Preview – ponteiro", creator: vercel, created_at: "t9" },
    ],
    "repos/{owner}/{repo}/deployments?environment=Production&per_page=5": [
      { id: 2, sha: "bbbbbbb111", ref: "main", environment: "Production", creator: vercel, created_at: "t2" },
      { id: 1, sha: "aaaaaaa111", ref: "main", environment: "Production", creator: vercel, created_at: "t1" },
    ],
    "repos/{owner}/{repo}/deployments?ref=feat%2F10-timer&per_page=5": [
      { id: 3, sha: "ccccccc111", ref: "feat/10-timer", environment: "Preview – ponteiro", creator: vercel, created_at: "t3" },
    ],
    "repos/{owner}/{repo}/deployments/2/statuses?per_page=1": [{ state: "success", environment_url: "https://ponteiro.vercel.app" }],
    "repos/{owner}/{repo}/deployments/3/statuses?per_page=1": [{ state: "success", environment_url: "https://ponteiro-git-feat-10.vercel.app" }],
  });
  process.env.ESTEIRA_FAKE_GH_PRS = JSON.stringify([{ number: 7, headRefName: "feat/10-timer", title: "feat(#10): timer" }, { number: 8, headRefName: "docs/spec-11-x", title: "spec" }]);
  const r = deployStatus({ cwd: repo() });
  assert.equal(r.ok, true);
  assert.equal(r.vercel, "conectada");
  assert.deepEqual(r.production, { sha: "bbbbbbb", ref: "main", createdAt: "t2", state: "success", url: "https://ponteiro.vercel.app" });
  assert.deepEqual(r.previews, [
    { pr: 7, title: "feat(#10): timer", ref: "feat/10-timer", state: "success", url: "https://ponteiro-git-feat-10.vercel.app" },
    { pr: 8, title: "spec", ref: "docs/spec-11-x", state: "sem deploy", url: null },
  ]);
  assert.equal(r.buildMigrates, true);
  assert.deepEqual(r.notes, []);
});

test("repo sem Vercel e build sem migração viram avisos", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({ "repos/{owner}/{repo}/deployments?per_page=10": [] });
  const r = deployStatus({ cwd: repo("next build") });
  assert.equal(r.vercel, "não conectada");
  assert.equal(r.production, null);
  assert.equal(r.buildMigrates, false);
  assert.equal(r.notes.length, 2);
});

test("falha ao ler deployments é erro", () => {
  process.env.ESTEIRA_FAKE_GH_API = "{}";
  assert.equal(deployStatus({ cwd: repo() }).ok, false);
});
