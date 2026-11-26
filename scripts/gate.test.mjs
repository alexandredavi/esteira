import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGate, gateMarker, parseGateMarker, buildBody } from "./gate.mjs";

const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function productRepo({ remote = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "esteira-gate-"));
  const dir = join(root, "produto");
  mkdirSync(dir);
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "config", "user.email", "t@example.com");
  sh(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "README.md"), "# p\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "init");
  if (remote) {
    const bare = join(root, "origin.git");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
    sh(dir, "remote", "add", "origin", bare);
    sh(dir, "push", "-q", "-u", "origin", "main");
    sh(dir, "remote", "set-head", "origin", "main");
  }
  const log = join(root, "gh.log");
  process.env.ESTEIRA_FAKE_GH = log;
  return { dir, root, log, bare: join(root, "origin.git") };
}

function writeArtifact(dir, path = "docs/product/discovery.md") {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), "# Discovery\n");
  return path;
}

test("marcador de gate ida e volta", () => {
  assert.equal(gateMarker("spec", [12, 13]), "<!-- esteira:gate stage=spec stories=12,13 -->");
  assert.deepEqual(parseGateMarker(`texto\n${gateMarker("spec", [12, 13])}`), { stage: "spec", stories: [12, 13] });
  assert.deepEqual(parseGateMarker(gateMarker("discovery", [])), { stage: "discovery", stories: [] });
  assert.equal(parseGateMarker("sem marcador"), null);
});

test("corpo do PR: resumo + checklist da etapa + marcador", () => {
  const body = buildBody({ stage: "discovery", stories: [], summary: "Produto X para freelancers." });
  assert.match(body, /## Gate: discovery/);
  assert.match(body, /### Resumo\n\nProduto X para freelancers\./);
  assert.match(body, /### Checklist do revisor/);
  assert.match(body, /\/esteira:prd/);
  assert.ok(body.trimEnd().endsWith("<!-- esteira:gate stage=discovery -->"));
});

test("etapa sem checklist ainda gera corpo válido", () => {
  const body = buildBody({ stage: "inexistente", stories: [3] });
  assert.match(body, /## Gate: inexistente/);
  assert.match(body, /stories=3/);
});

test("argumentos obrigatórios", () => {
  assert.equal(openGate({ stage: "discovery" }).ok, false);
});

test("arquivo inexistente é erro", () => {
  const { dir } = productRepo();
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "t", paths: "docs/nao-existe.md" });
  assert.equal(r.ok, false);
  assert.match(r.error, /não encontrados/);
});

test("fora de um repo git: salva local, não falha", () => {
  const dir = mkdtempSync(join(tmpdir(), "esteira-nogit-"));
  const path = writeArtifact(dir);
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "t", paths: path });
  assert.equal(r.ok, true);
  assert.equal(r.opened, false);
  assert.match(r.reason, /Não é um repositório git/);
});

test("sem remoto: commita no branch, não abre PR", () => {
  const { dir } = productRepo({ remote: false });
  const path = writeArtifact(dir);
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "docs(discovery): x", paths: path });
  assert.equal(r.ok, true);
  assert.equal(r.opened, false);
  assert.equal(r.committed, true);
  assert.equal(sh(dir, "branch", "--show-current"), "docs/discovery");
  assert.equal(sh(dir, "log", "-1", "--format=%s"), "docs(discovery): x");
});

test("com remoto: branch a partir do padrão, push e PR com marcador", () => {
  const { dir, log, bare } = productRepo();
  const path = writeArtifact(dir);
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "docs(discovery): x", paths: path, stories: "" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.opened, true);
  assert.equal(r.url, "https://github.com/fake/produto/pull/1");
  assert.equal(r.baseBranch, "main");
  assert.match(execFileSync("git", ["ls-remote", bare], { encoding: "utf8" }), /refs\/heads\/docs\/discovery/);
  const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const create = calls.find((c) => c[0] === "pr" && c[1] === "create");
  assert.ok(create, "gh pr create não foi chamado");
  assert.deepEqual(create.slice(2, 6), ["--base", "main", "--head", "docs/discovery"]);
  const body = readFileSync(create[create.indexOf("--body-file") + 1], "utf8");
  assert.match(body, /<!-- esteira:gate stage=discovery -->/);
});

test("rodar de novo sem mudanças não cria commit vazio", () => {
  const { dir } = productRepo({ remote: false });
  const path = writeArtifact(dir);
  openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "t", paths: path });
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "t", paths: path });
  assert.equal(r.committed, false);
  assert.equal(sh(dir, "rev-list", "--count", "HEAD"), "2");
});

test("stories entram no marcador", () => {
  const { dir, log } = productRepo();
  const path = writeArtifact(dir, "docs/specs/12-timer.md");
  openGate({ cwd: dir, stage: "spec", branch: "docs/spec-12", title: "t", paths: path, stories: "12,13" });
  const create = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((c) => c[1] === "create");
  assert.match(readFileSync(create[create.indexOf("--body-file") + 1], "utf8"), /stories=12,13/);
  assert.ok(existsSync(join(dir, path)));
});

test("revisão: o gate não leva para o commit o que já estava no stage", () => {
  const { dir } = productRepo({ remote: false });
  writeFileSync(join(dir, "segredo.txt"), "x");
  sh(dir, "add", "segredo.txt");
  const path = writeArtifact(dir);
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "t", paths: path });
  assert.equal(r.committed, true);
  const files = sh(dir, "show", "--name-only", "--format=", "HEAD").split("\n");
  assert.deepEqual(files, ["docs/product/discovery.md"]);
});

test("revisão: revisar um gate aberto a partir da main reaproveita o branch", () => {
  const { dir } = productRepo({ remote: false });
  const path = writeArtifact(dir);
  openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "v1", paths: path });
  sh(dir, "switch", "-q", "main");
  mkdirSync(join(dir, "docs/product"), { recursive: true });
  writeFileSync(join(dir, path), "# Discovery v2\n");
  const r = openGate({ cwd: dir, stage: "discovery", branch: "docs/discovery", title: "v2", paths: path });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.committed, true);
  assert.equal(sh(dir, "branch", "--show-current"), "docs/discovery");
  assert.equal(readFileSync(join(dir, path), "utf8"), "# Discovery v2\n");
  assert.equal(sh(dir, "log", "-1", "--format=%s"), "v2");
  assert.equal(sh(dir, "stash", "list"), "");
});
