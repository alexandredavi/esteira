// Testes determinísticos do coletor de status. Rodar: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collect, nextStep } from "./status.mjs";

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
