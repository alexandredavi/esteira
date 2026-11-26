// Cenários com remoto de verdade (bare repo): merge acontecendo "no GitHub" (outro clone) e a main local desatualizada.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sync } from "./sync.mjs";
import { collect } from "./status.mjs";

const g = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const ident = (dir) => { g(dir, "config", "user.email", "t@example.com"); g(dir, "config", "user.name", "t"); };

// Produto com remoto SEM origin/HEAD (como fica com git init + remote add + push).
function setup() {
  const root = mkdtempSync(join(tmpdir(), "esteira-sync-"));
  const bare = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  const dev = join(root, "produto");
  mkdirSync(dev);
  g(dev, "init", "-q", "-b", "main"); ident(dev);
  writeFileSync(join(dev, "README.md"), "# p\n");
  g(dev, "add", "-A"); g(dev, "commit", "-q", "-m", "init");
  g(dev, "remote", "add", "origin", bare); g(dev, "push", "-q", "-u", "origin", "main");
  return { root, bare, dev };
}

// Simula o gate: branch docs/discovery com o artefato, push, e o "merge no GitHub" feito por outro clone.
function gateAndRemoteMerge({ root, bare, dev }) {
  g(dev, "switch", "-q", "-c", "docs/discovery");
  mkdirSync(join(dev, "docs/product"), { recursive: true });
  writeFileSync(join(dev, "docs/product/discovery.md"), "# D\n");
  g(dev, "add", "-A"); g(dev, "commit", "-q", "-m", "docs(discovery)"); g(dev, "push", "-q", "-u", "origin", "docs/discovery");
  const gh = join(root, "github");
  execFileSync("git", ["clone", "-q", bare, gh]); ident(gh);
  g(gh, "merge", "-q", "--no-ff", "origin/docs/discovery", "-m", "Merge PR #1"); g(gh, "push", "-q", "origin", "main");
}

beforeEach(() => {
  delete process.env.ESTEIRA_NO_FETCH;
  process.env.ESTEIRA_GH_FIXTURE = join(mkdtempSync(join(tmpdir(), "esteira-fx-")), "gh.json");
  writeFileSync(process.env.ESTEIRA_GH_FIXTURE, JSON.stringify({ issues: [], prs: [] }));
});

test("status enxerga o merge feito no GitHub mesmo com a main local desatualizada", () => {
  const repo = setup();
  gateAndRemoteMerge(repo);
  const s = collect(repo.dev);
  assert.equal(s.defaultBranch, "main");
  assert.equal(s.comparedTo, "origin/main");
  assert.equal(s.artifacts.discovery.merged, true);
  assert.equal(s.next.command, "/esteira:prd");
});

test("sync volta do branch de gate para a main e traz o merge", () => {
  const repo = setup();
  gateAndRemoteMerge(repo);
  const r = sync(repo.dev);
  assert.equal(r.synced, true, JSON.stringify(r));
  assert.equal(r.switched, true);
  assert.equal(r.updated, true);
  assert.equal(g(repo.dev, "branch", "--show-current"), "main");
  assert.ok(existsSync(join(repo.dev, "docs/product/discovery.md")));
});

test("sync não troca de branch com mudanças não commitadas", () => {
  const repo = setup();
  gateAndRemoteMerge(repo);
  writeFileSync(join(repo.dev, "docs/product/discovery.md"), "# D editado\n");
  const r = sync(repo.dev);
  assert.equal(r.synced, false);
  assert.match(r.reason, /mudanças não commitadas/);
  assert.equal(g(repo.dev, "branch", "--show-current"), "docs/discovery");
});

test("gate só local (sem PR): status pede o merge do branch", () => {
  const repo = setup();
  g(repo.dev, "remote", "remove", "origin");
  g(repo.dev, "switch", "-q", "-c", "docs/discovery");
  mkdirSync(join(repo.dev, "docs/product"), { recursive: true });
  writeFileSync(join(repo.dev, "docs/product/discovery.md"), "# D\n");
  g(repo.dev, "add", "-A"); g(repo.dev, "commit", "-q", "-m", "docs(discovery)");
  const s = collect(repo.dev);
  assert.equal(s.artifacts.discovery.merged, false);
  assert.equal(s.artifacts.discovery.pendingBranch, "docs/discovery");
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.branch, "docs/discovery");
});

test("sync --to volta ao branch do gate para revisar o PR aberto", () => {
  const repo = setup();
  gateAndRemoteMerge(repo);
  sync(repo.dev);
  const r = sync(repo.dev, { to: "docs/discovery" });
  assert.equal(r.synced, true, JSON.stringify(r));
  assert.equal(g(repo.dev, "branch", "--show-current"), "docs/discovery");
  assert.equal(sync(repo.dev, { to: "nao-existe" }).ok, false);
});

test("fora de um repo git o sync não bloqueia", () => {
  const r = sync(mkdtempSync(join(tmpdir(), "esteira-nogit-")));
  assert.equal(r.synced, false);
  assert.equal(r.blocking, false);
});
