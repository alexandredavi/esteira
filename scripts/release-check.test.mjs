import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseCheck } from "./release-check.mjs";

const good = { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, squash_merge_commit_title: "PR_TITLE" };
beforeEach(() => { process.env.ESTEIRA_FAKE_GH = join(mkdtempSync(join(tmpdir(), "esteira-ghlog-")), "gh.log"); });
const routes = (perms, settings) => { process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({ "repos/{owner}/{repo}/actions/permissions/workflow": perms, "repos/{owner}/{repo}": settings }); };

test("repo pronto para o release-please", () => {
  routes({ default_workflow_permissions: "write", can_approve_pull_request_reviews: true }, good);
  const r = releaseCheck({ cwd: "." });
  assert.equal(r.ok, true);
  assert.equal(r.allOk, true);
});

test("padrão do GitHub (merge commit, workflow só leitura) reprova e diz como corrigir", () => {
  routes({ default_workflow_permissions: "read", can_approve_pull_request_reviews: false },
    { allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true, squash_merge_commit_title: "COMMIT_OR_PR_TITLE" });
  const r = releaseCheck({ cwd: "." });
  assert.equal(r.allOk, false);
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.id), ["workflow-write", "workflow-pr", "squash-only", "squash-title"]);
  assert.match(r.checks.find((c) => c.id === "squash-only").comoCorrigir, /gh repo edit fake\/produto --enable-squash-merge/);
});

test("sem acesso às configurações é erro", () => {
  process.env.ESTEIRA_FAKE_GH_API = "{}";
  assert.equal(releaseCheck({ cwd: "." }).ok, false);
});
