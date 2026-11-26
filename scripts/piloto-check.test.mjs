import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pilotoCheck } from "./piloto-check.mjs";

beforeEach(() => {
  process.env.ESTEIRA_FAKE_GH = join(mkdtempSync(join(tmpdir(), "esteira-ghlog-")), "gh.log");
  delete process.env.ESTEIRA_FAKE_GH_API;
  delete process.env.ESTEIRA_FAKE_GH_SECRETS;
});
const secrets = (...n) => { process.env.ESTEIRA_FAKE_GH_SECRETS = JSON.stringify(n.map((name) => ({ name }))); };
const failing = (r) => r.checks.filter((c) => !c.ok).map((c) => c.id);

test("tudo pronto: credencial, token, main com PR por ruleset sem bypass", () => {
  secrets("CLAUDE_CODE_OAUTH_TOKEN", "ESTEIRA_PILOTO_TOKEN");
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    "repos/{owner}/{repo}/rules/branches/main": [{ type: "pull_request", ruleset_id: 7 }],
    "repos/{owner}/{repo}/rulesets/7": { bypass_actors: [] },
  });
  const r = pilotoCheck({ cwd: "." });
  assert.equal(r.allOk, true, JSON.stringify(r.checks));
});

test("repo novo: main aceita push direto e faltam os secrets", () => {
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({ "repos/{owner}/{repo}/rules/branches/main": [] });
  const r = pilotoCheck({ cwd: "." });
  assert.deepEqual(failing(r), ["credencial-claude", "token-piloto", "main-exige-pr", "sem-bypass"]);
  assert.match(r.checks.find((c) => c.id === "main-exige-pr").comoCorrigir, /Require a pull request/);
});

test("ruleset com bypass não basta: o token de quem pode pular também pula", () => {
  secrets("ANTHROPIC_API_KEY", "ESTEIRA_PILOTO_TOKEN");
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    "repos/{owner}/{repo}/rules/branches/main": [{ type: "pull_request", ruleset_id: 9 }],
    "repos/{owner}/{repo}/rulesets/9": { bypass_actors: [{ actor_type: "RepositoryRole", actor_id: 5 }] },
  });
  const r = pilotoCheck({ cwd: "." });
  assert.deepEqual(failing(r), ["sem-bypass"]);
  assert.match(r.checks.find((c) => c.id === "sem-bypass").atual, /RepositoryRole#5/);
});

test("proteção clássica: vale com enforce_admins; sem ele, administradores pulam", () => {
  secrets("ANTHROPIC_API_KEY", "ESTEIRA_PILOTO_TOKEN");
  process.env.ESTEIRA_FAKE_GH_API = JSON.stringify({
    "repos/{owner}/{repo}/rules/branches/main": [],
    "repos/{owner}/{repo}/branches/main/protection": { required_pull_request_reviews: {}, enforce_admins: { enabled: false } },
  });
  assert.deepEqual(failing(pilotoCheck({ cwd: "." })), ["sem-bypass"]);
});
