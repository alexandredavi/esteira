// Testes determinísticos do coletor de status. Rodar: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, nextStep, readSpecFrontmatter } from "./status.mjs";

function repo({ files = [], gh = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "esteira-status-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(dir, "README.md"), "# produto\n");
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "conteúdo\n");
  }
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  if (gh) {
    const fixture = join(dir, "..", `${dir.split(/[\\/]/).pop()}-gh.json`);
    writeFileSync(fixture, JSON.stringify(gh));
    process.env.ESTEIRA_GH_FIXTURE = fixture;
  } else {
    delete process.env.ESTEIRA_GH_FIXTURE;
  }
  return dir;
}

const story = (number, labels = [], state = "OPEN") => ({ number, title: `Story ${number}`, state, labels: ["type:story", ...labels].map((name) => ({ name })) });
const PRODUCT = ["package.json", "docs/product/discovery.md", "docs/product/prd.md"];
const BACKLOG = [...PRODUCT, "docs/specs/10-timer.md"];
const ALL = [...BACKLOG, "docs/design/README.md"];

test("repo vazio sugere /setup (episódio 0)", () => {
  const s = collect(repo({ gh: { issues: [], prs: [] } }));
  assert.equal(s.next.command, "/esteira:setup");
  assert.equal(s.next.action, "run");
});

test("app montado e nada mais → /discovery", () => {
  const s = collect(repo({ files: ["package.json"], gh: { issues: [], prs: [] } }));
  assert.equal(s.next.command, "/esteira:discovery");
});

test("discovery em PR aberto pede merge, não rodar de novo", () => {
  const gh = { issues: [], prs: [{ number: 3, url: "u", headRefName: "docs/discovery", body: "", files: [{ path: "docs/product/discovery.md" }] }] };
  const s = collect(repo({ files: ["package.json"], gh }));
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.pr.number, 3);
});

test("arquivo só no working tree (não commitado) não conta como mergeado", () => {
  const dir = repo({ files: ["package.json"], gh: { issues: [], prs: [] } });
  mkdirSync(join(dir, "docs/product"), { recursive: true });
  writeFileSync(join(dir, "docs/product/discovery.md"), "rascunho\n");
  assert.equal(collect(dir).next.command, "/esteira:discovery");
});

test("discovery e prd prontos, sem stories → /backlog", () => {
  const s = collect(repo({ files: PRODUCT, gh: { issues: [], prs: [] } }));
  assert.equal(s.next.command, "/esteira:backlog");
});

test("sem GitHub, depois do PRD pede setup", () => {
  const s = nextStep({ app: { merged: true }, discovery: { merged: true }, prd: { merged: true }, designSystem: { merged: false } }, [], false);
  assert.equal(s.action, "setup");
});

test("issues criadas mas specs em PR aberto → mergear o PR do backlog", () => {
  const gh = { issues: [story(10)], prs: [{ number: 4, url: "u", headRefName: "docs/backlog", body: "", files: [{ path: "docs/specs/10-timer.md" }] }] };
  const s = collect(repo({ files: PRODUCT, gh }));
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.command, "/esteira:backlog");
  assert.equal(s.next.pr.number, 4);
});

test("issues criadas sem specs nem PR → rodar /backlog de novo", () => {
  const s = collect(repo({ files: PRODUCT, gh: { issues: [story(10)], prs: [] } }));
  assert.equal(s.next.command, "/esteira:backlog");
  assert.equal(s.next.action, "run");
});

test("stories sem design system → /design-system", () => {
  const s = collect(repo({ files: BACKLOG, gh: { issues: [story(10)], prs: [] } }));
  assert.equal(s.next.command, "/esteira:design-system");
});

test("estágios das stories e prioridade do próximo passo", () => {
  const gh = {
    issues: [story(10), story(11, ["design:approved"]), story(12, ["spec:approved", "ready-for-dev"]), story(13, [], "CLOSED"), { number: 1, title: "Épico", state: "OPEN", labels: [{ name: "type:epic" }] }],
    prs: [],
  };
  const s = collect(repo({ files: ALL, gh }));
  assert.deepEqual(s.summary, { epics: 1, stories: 4, backlog: 1, designReview: 0, designApproved: 1, specReview: 0, readyForDev: 1, inReview: 0, done: 1 });
  assert.equal(s.next.command, "/esteira:dev 12");
});

test("PR com Closes # coloca a story em review e review vem primeiro", () => {
  const gh = {
    issues: [story(12, ["ready-for-dev"]), story(14, ["ready-for-dev"])],
    prs: [{ number: 20, url: "u", headRefName: "feat/12-timer", body: "Closes #12", files: [] }],
  };
  const s = collect(repo({ files: ALL, gh }));
  assert.equal(s.stories.find((x) => x.number === 12).stage, "in-review");
  assert.equal(s.next.command, "/esteira:review 20");
});

test("branch feat/<issue>-slug também liga o PR à story", () => {
  const gh = { issues: [story(15, ["ready-for-dev"])], prs: [{ number: 21, url: "u", headRefName: "feat/15-relatorio", body: "", files: [] }] };
  assert.equal(collect(repo({ files: ALL, gh })).stories[0].stage, "in-review");
});

test("tudo concluído → /release", () => {
  const s = collect(repo({ files: ALL, gh: { issues: [story(10, [], "CLOSED")], prs: [] } }));
  assert.equal(s.next.command, "/esteira:release");
});

const gatePr = (number, stage, stories) => ({ number, url: `u${number}`, headRefName: `design/${stories[0]}-x`, body: `Gate\n\n<!-- esteira:gate stage=${stage} stories=${stories.join(",")} -->`, files: [] });

test("protótipo em PR de gate aberto: story em design-review e o próximo passo é o merge", () => {
  const gh = { issues: [story(10), story(11)], prs: [gatePr(30, "prototipo", [10])] };
  const s = collect(repo({ files: ALL, gh }));
  assert.equal(s.stories[0].stage, "design-review");
  assert.deepEqual(s.stories[0].pr, { number: 30, url: "u30" });
  assert.equal(s.stories[1].stage, "backlog");
  assert.equal(s.summary.designReview, 1);
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.command, "/esteira:prototipo 10");
  assert.equal(s.next.pr.number, 30);
});

test("spec em PR de gate aberto: spec-review tem prioridade sobre protótipos pendentes", () => {
  const gh = { issues: [story(10, ["design:approved"]), story(11)], prs: [gatePr(31, "spec", [10]), gatePr(32, "prototipo", [11])] };
  const s = collect(repo({ files: ALL, gh }));
  assert.equal(s.stories[0].stage, "spec-review");
  assert.equal(s.next.command, "/esteira:spec 10");
});

test("PR de gate não é confundido com PR de dev (não vira in-review)", () => {
  const pr = { ...gatePr(33, "prototipo", [12]), body: "Closes #12\n<!-- esteira:gate stage=prototipo stories=12 -->" };
  const s = collect(repo({ files: ALL, gh: { issues: [story(12)], prs: [pr] } }));
  assert.equal(s.stories[0].stage, "design-review");
});

test("design system em PR aberto pede merge antes do protótipo", () => {
  const gh = { issues: [story(10)], prs: [{ number: 5, url: "u5", headRefName: "design/system", body: "", files: [{ path: "docs/design/README.md" }] }] };
  const s = collect(repo({ files: BACKLOG, gh }));
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.command, "/esteira:design-system");
});

test("revisão F2: PR de revisão do protótipo aberto vence a label design:approved", () => {
  const s = collect(repo({ files: ALL, gh: { issues: [story(10, ["design:approved"])], prs: [gatePr(40, "prototipo", [10])] } }));
  assert.equal(s.stories[0].stage, "design-review");
  assert.equal(s.next.action, "merge");
  assert.equal(s.next.pr.number, 40);
});

test("revisão F2: dois gates abertos na mesma story — o de spec prevalece em qualquer ordem", () => {
  for (const prs of [[gatePr(41, "prototipo", [10]), gatePr(42, "spec", [10])], [gatePr(42, "spec", [10]), gatePr(41, "prototipo", [10])]]) {
    const s = collect(repo({ files: ALL, gh: { issues: [story(10, ["design:approved"])], prs } }));
    assert.equal(s.stories[0].stage, "spec-review");
    assert.equal(s.stories[0].pr.number, 42);
  }
});

test("F3: specs aprovadas listadas do branch padrão com o status do frontmatter", () => {
  const dir = repo({ files: ALL, gh: { issues: [], prs: [] } });
  writeFileSync(join(dir, "docs/specs/10-timer.md"), "---\nissue: 10\nepic: 2\nslug: timer\nstatus: spec\n---\n# x\n");
  execFileSync("git", ["commit", "-qam", "spec aprovada"], { cwd: dir });
  writeFileSync(join(dir, "docs/specs/10-timer.md"), "---\nissue: 10\nslug: timer\nstatus: dev\n---\n");
  const s = collect(dir);
  assert.deepEqual(s.specs, [{ path: "docs/specs/10-timer.md", issue: 10, slug: "timer", status: "spec" }]);
});

test("F3: story em review sem teste de aceite no branch do PR → /esteira:testes; com teste → /esteira:review", () => {
  const dir = repo({ files: ALL, gh: { issues: [story(12, ["ready-for-dev"])], prs: [{ number: 50, url: "u50", headRefName: "feat/12-timer", body: "Closes #12", files: [] }] } });
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("switch", "-q", "-c", "feat/12-timer");
  writeFileSync(join(dir, "README.md"), "# dev\n");
  g("commit", "-qam", "dev sem teste");
  let s = collect(dir);
  assert.equal(s.stories[0].acceptanceTests, false);
  assert.equal(s.next.command, "/esteira:testes 12");
  mkdirSync(join(dir, "e2e"), { recursive: true });
  writeFileSync(join(dir, "e2e/12-timer.spec.ts"), 'test("AC-12.1 — x", () => {});\n');
  g("add", "-A");
  g("commit", "-qm", "testes");
  s = collect(dir);
  assert.equal(s.stories[0].acceptanceTests, true);
  assert.equal(s.next.command, "/esteira:review 50");
});

test("revisão F3: frontmatter com BOM, aspas e comentário; status ausente = null", () => {
  assert.equal(readSpecFrontmatter("﻿---\nissue: 3\nstatus: spec\n---\n").status, "spec");
  assert.equal(readSpecFrontmatter('---\nstatus: "dev" # x\n---\n').status, "dev");
  assert.equal(readSpecFrontmatter("---\nissue: 3\n---\n").status, null);
});

test("revisão F3: só título de test() com o AC conta como teste de aceite no branch do PR", () => {
  const dir = repo({ files: ALL, gh: { issues: [story(12, ["ready-for-dev"])], prs: [{ number: 51, url: "u51", headRefName: "feat/12-x", body: "Closes #12", files: [] }] } });
  const g = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("switch", "-q", "-c", "feat/12-x");
  mkdirSync(join(dir, "e2e"), { recursive: true });
  writeFileSync(join(dir, "e2e/12-x.spec.ts"), "// TODO: escrever o teste do AC-12.1\n");
  g("add", "-A");
  g("commit", "-qm", "só comentário");
  assert.equal(collect(dir).stories[0].acceptanceTests, false);
});
