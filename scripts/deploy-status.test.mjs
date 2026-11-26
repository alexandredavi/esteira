// Formatos reais da integração da Vercel, observados no dry-run da F6 (commit status "Vercel" + comentário do bot).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployStatus } from "./deploy-status.mjs";

function repo(build = "node scripts/esteira/migrate.mjs && next build") {
  const dir = mkdtempSync(join(tmpdir(), "esteira-deploy-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build } }));
  return dir;
}
const vercel = (state, id) => ({ context: "Vercel", state, target_url: `https://vercel.com/eu/app/${id}`, description: "Deployment has completed" });

beforeEach(() => {
  process.env.ESTEIRA_FAKE_GH = join(mkdtempSync(join(tmpdir(), "esteira-ghlog-")), "gh.log");
  delete process.env.ESTEIRA_FAKE_GH_API;
  delete process.env.ESTEIRA_FAKE_GH_PRS;
});

test("produção pelo status Vercel da main; preview pelo status do head e URL do comentário do bot", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    "repos/{owner}/{repo}/commits/main/status": { statuses: [{ context: "ci", state: "success" }, vercel("success", "PROD")] },
    "repos/{owner}/{repo}/commits/sha27/status": { statuses: [vercel("success", "PREV")] },
    "repos/{owner}/{repo}/issues/27/comments?per_page=50": [
      { user: { login: "outra-pessoa" }, body: "https://nao-e-esse.vercel.app" },
      { user: { login: "vercel[bot]" }, body: "| Preview | [Visit](https://app-git-docs-no-ar-eu.vercel.app) |" },
    ],
    "repos/{owner}/{repo}/commits/sha28/status": { statuses: [] },
  });
  process.env.ESTEIRA_FAKE_GH_PRS = JSON.stringify([{ number: 27, headRefName: "docs/no-ar", headRefOid: "sha27", title: "docs" }, { number: 28, headRefName: "feat/9-x", headRefOid: "sha28", title: "feat" }]);
  const r = deployStatus({ cwd: repo() });
  assert.equal(r.ok, true);
  assert.equal(r.vercel, "conectada");
  assert.deepEqual(r.production, { ref: "main", state: "success", inspect: "https://vercel.com/eu/app/PROD", description: "Deployment has completed" });
  assert.deepEqual(r.previews, [
    { pr: 27, title: "docs", ref: "docs/no-ar", state: "success", url: "https://app-git-docs-no-ar-eu.vercel.app", inspect: "https://vercel.com/eu/app/PREV" },
    { pr: 28, title: "feat", ref: "feat/9-x", state: "sem deploy", url: null, inspect: null },
  ]);
  assert.deepEqual(r.notes, []);
});

test("sem status da Vercel em lugar nenhum: não conectada, com aviso; build sem migração também avisa", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({ "repos/{owner}/{repo}/commits/main/status": { statuses: [] } });
  const r = deployStatus({ cwd: repo("next build") });
  assert.equal(r.vercel, "não conectada");
  assert.equal(r.production, null);
  assert.equal(r.notes.length, 2);
});

test("revisão F6: 'Vercel Preview Comments' verde não mascara o deploy que falhou; fork com branch main usa o SHA", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    "repos/{owner}/{repo}/commits/main/status": { statuses: [vercel("success", "PROD")] },
    "repos/{owner}/{repo}/commits/forksha/status": { statuses: [{ context: "Vercel Preview Comments", state: "success" }, vercel("failure", "FORK")] },
    "repos/{owner}/{repo}/issues/30/comments?per_page=50": [],
  });
  process.env.ESTEIRA_FAKE_GH_PRS = JSON.stringify([{ number: 30, headRefName: "main", headRefOid: "forksha", title: "de um fork" }]);
  const r = deployStatus({ cwd: repo() });
  assert.equal(r.previews[0].state, "failure");
  assert.equal(r.previews[0].inspect, "https://vercel.com/eu/app/FORK");
  assert.equal(r.production.inspect, "https://vercel.com/eu/app/PROD");
});
