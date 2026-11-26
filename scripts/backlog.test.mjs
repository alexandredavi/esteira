import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePlan, renderSpec, renderGherkin, publish, acId } from "./backlog.mjs";

const TEMPLATE = readFileSync(new URL("../templates/spec.md", import.meta.url), "utf8");

const ac = (title, extra = "") => ({ title, gherkin: `Dado que estou logado\nQuando clico em iniciar${extra}\nEntão o timer começa a contar` });
const story = (slug, acs = [ac("inicia o timer")]) => ({
  title: `Story ${slug}`, slug, asA: "freelancer", iWant: "iniciar um timer", soThat: "registrar minhas horas",
  context: "Contexto.", outOfScope: ["Pausar"], acceptance: acs,
});
const plan = () => ({
  epics: [
    { cap: "CAP-1", title: "Registrar tempo", description: "Timer e lançamento manual.", stories: [story("timer-start-stop", [ac("inicia o timer"), ac("para o timer")]), story("lancamento-manual")] },
    { cap: "CAP-2", title: "Relatórios", description: "Horas por projeto.", stories: [story("relatorio-por-projeto")] },
  ],
});

function workdir(p = plan()) {
  const dir = mkdtempSync(join(tmpdir(), "esteira-backlog-"));
  mkdirSync(join(dir, ".esteira"));
  writeFileSync(join(dir, ".esteira/backlog.plan.json"), JSON.stringify(p));
  return dir;
}

beforeEach(() => {
  process.env.ESTEIRA_FAKE_GH = join(mkdtempSync(join(tmpdir(), "esteira-ghlog-")), "gh.log");
  delete process.env.ESTEIRA_FAKE_GH_ISSUES;
});

const calls = () => readFileSync(process.env.ESTEIRA_FAKE_GH, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("plano válido não tem erros", () => {
  assert.deepEqual(validatePlan(plan()), []);
});

test("validação aponta CAP, slug, Gherkin e repetição", () => {
  const p = plan();
  p.epics[0].cap = "1";
  p.epics[0].stories[0].slug = "Timer Start";
  p.epics[1].stories[0].slug = "lancamento-manual";
  p.epics[0].stories[1].acceptance = [{ title: "x", gherkin: "Quando algo\nEntão outro" }];
  p.epics[1].stories[0].acceptance.push({ title: "y", gherkin: "Dado a\nQuando b\nEntão c\nisso não é passo" });
  const errors = validatePlan(p).join("\n");
  assert.match(errors, /cap deve ser CAP-<n>/);
  assert.match(errors, /kebab-case/);
  assert.match(errors, /repetido/);
  assert.match(errors, /Dado, Quando e Então/);
  assert.match(errors, /não é passo Gherkin/);
});

test("plano vazio e limite de stories", () => {
  assert.match(validatePlan({ epics: [] })[0], /pelo menos um épico/);
  const big = { epics: [{ cap: "CAP-1", title: "t", description: "d", stories: Array.from({ length: 41 }, (_, i) => story(`s-${i}`)) }] };
  assert.match(validatePlan(big).join(), /limite é 40/);
});

test("Gherkin renderizado com cenário e indentação", () => {
  assert.equal(renderGherkin(ac("inicia")), "```gherkin\nCenário: inicia\n  Dado que estou logado\n  Quando clico em iniciar\n  Então o timer começa a contar\n```");
});

test("spec renderizada com IDs AC-<issue>.<n> e sem placeholders", () => {
  const s = { ...story("timer-start-stop", [ac("inicia"), ac("para")]), number: 12 };
  const md = renderSpec(s, { number: 3, title: "Registrar tempo" }, TEMPLATE);
  assert.match(md, /^---\nissue: 12\nepic: 3\nslug: timer-start-stop\n---/);
  assert.match(md, /#### AC-12\.1 — inicia/);
  assert.match(md, /#### AC-12\.2 — para/);
  assert.match(md, /\*\*Como\*\* freelancer, \*\*quero\*\* iniciar um timer/);
  assert.doesNotMatch(md, /{{\w+}}/);
  assert.equal(acId(12, 0), "AC-12.1");
});

test("dry-run: numera épicos primeiro, escreve specs e não chama o GitHub", () => {
  const dir = workdir();
  const r = publish({ cwd: dir, plan: ".esteira/backlog.plan.json", "dry-run": true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.simulated, true);
  assert.deepEqual(r.epics.map((e) => e.number), [1, 2]);
  assert.deepEqual(r.stories.map((s) => s.number), [3, 4, 5]);
  assert.deepEqual(r.files, [".esteira/specs-preview/3-timer-start-stop.md", ".esteira/specs-preview/4-lancamento-manual.md", ".esteira/specs-preview/5-relatorio-por-projeto.md"]);
  assert.equal(existsSync(join(dir, "docs/specs")), false, "dry-run não pode escrever em docs/specs");
  assert.deepEqual(r.stories[0].acceptance, ["AC-3.1", "AC-3.2"]);
  assert.ok(existsSync(join(dir, r.files[0])));
  assert.equal(existsSync(process.env.ESTEIRA_FAKE_GH), false);
});

test("plano inválido não publica nada", () => {
  const p = plan();
  p.epics[0].stories[0].acceptance = [];
  const r = publish({ cwd: workdir(p), plan: ".esteira/backlog.plan.json" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
  assert.equal(existsSync(process.env.ESTEIRA_FAKE_GH), false);
});

test("publicação: labels, épicos antes de stories, corpos com IDs reais", () => {
  const dir = workdir();
  const r = publish({ cwd: dir, plan: ".esteira/backlog.plan.json" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = calls();
  const labels = c.filter((x) => x[0] === "label").map((x) => x[2]);
  assert.deepEqual(labels, ["type:epic", "type:story", "design:approved", "spec:approved", "ready-for-dev"]);
  const created = c.filter((x) => x[0] === "issue" && x[1] === "create").map((x) => [x[3], x[5]]);
  assert.deepEqual(created, [
    ["[CAP-1] Registrar tempo", "type:epic"], ["[CAP-2] Relatórios", "type:epic"],
    ["Story timer-start-stop", "type:story"], ["Story lancamento-manual", "type:story"], ["Story relatorio-por-projeto", "type:story"],
  ]);
  const first = r.stories[0];
  assert.equal(first.acceptance[0], `AC-${first.number}.1`);
  const edit = c.find((x) => x[1] === "edit" && x[2] === String(first.number));
  const body = readFileSync(edit[edit.indexOf("--body-file") + 1], "utf8");
  assert.match(body, new RegExp(`AC-${first.number}\\.1`));
  assert.match(body, new RegExp(`\\*\\*Épico:\\*\\* #${r.epics[0].number}`));
  assert.ok(existsSync(join(dir, `docs/specs/${first.number}-timer-start-stop.md`)));
  assert.equal(c.some((x) => x[0] === "project"), false);
});

test("idempotente: reaproveita issues com o mesmo título", () => {
  process.env.ESTEIRA_FAKE_GH_ISSUES = JSON.stringify([
    { number: 7, title: "[CAP-1] Registrar tempo", url: "https://github.com/fake/produto/issues/7", labels: [{ name: "type:epic" }] },
    { number: 9, title: "Story timer-start-stop", url: "https://github.com/fake/produto/issues/9", labels: [{ name: "type:story" }] },
  ]);
  const r = publish({ cwd: workdir(), plan: ".esteira/backlog.plan.json" });
  assert.equal(r.epics[0].number, 7);
  assert.equal(r.epics[0].created, false);
  assert.equal(r.stories[0].number, 9);
  assert.equal(r.stories[0].created, false);
  const createdTitles = calls().filter((x) => x[1] === "create").map((x) => x[3]);
  assert.equal(createdTitles.includes("Story timer-start-stop"), false);
});

test("GitHub Project opcional adiciona épicos e stories", () => {
  publish({ cwd: workdir(), plan: ".esteira/backlog.plan.json", project: "3", owner: "alguem" });
  const adds = calls().filter((x) => x[0] === "project");
  assert.equal(adds.length, 5);
  assert.deepEqual(adds[0].slice(0, 5), ["project", "item-add", "3", "--owner", "alguem"]);
});

test("revisão: outOfScope precisa ser lista e itens precisam ser objetos", () => {
  const p = plan();
  p.epics[0].stories[0].outOfScope = "nada";
  assert.match(validatePlan(p).join(), /outOfScope deve ser uma lista/);
  assert.match(validatePlan({ epics: [null] }).join(), /deve ser um objeto/);
  const q = plan();
  q.epics[0].stories[0].acceptance = [null];
  assert.match(validatePlan(q).join(), /deve ser um objeto \{ title, gherkin \}/);
});

test("revisão: títulos repetidos entre stories são rejeitados", () => {
  const p = plan();
  p.epics[1].stories[0].title = p.epics[0].stories[0].title;
  assert.match(validatePlan(p).join(), /repete o título/);
});

test("revisão: Dada/Dados/Dadas são palavras-chave válidas", () => {
  const p = plan();
  p.epics[0].stories[0].acceptance = [
    { title: "a", gherkin: "Dada uma cliente\nQuando abro\nEntão vejo" },
    { title: "b", gherkin: "Dados dois projetos\nE um registro\nQuando abro\nEntao vejo\nMas não vejo outro" },
  ];
  assert.deepEqual(validatePlan(p), []);
  p.epics[0].stories[0].acceptance = [{ title: "c", gherkin: "Dadinho\nQuando x\nEntão y" }];
  assert.match(validatePlan(p).join(), /Dado, Quando e Então/);
});

test("revisão: issue sem a label da esteira não é reaproveitada mesmo com título igual", () => {
  process.env.ESTEIRA_FAKE_GH_ISSUES = JSON.stringify([
    { number: 3, title: "Story timer-start-stop", url: "https://github.com/fake/produto/issues/3", labels: [{ name: "bug" }] },
  ]);
  const r = publish({ cwd: workdir(), plan: ".esteira/backlog.plan.json" });
  assert.notEqual(r.stories[0].number, 3);
  assert.equal(r.stories[0].created, true);
});

test("revisão: listagem filtra por label para idempotência", () => {
  publish({ cwd: workdir(), plan: ".esteira/backlog.plan.json" });
  const lists = calls().filter((x) => x[0] === "issue" && x[1] === "list").map((x) => x[x.indexOf("--label") + 1]);
  assert.deepEqual(lists, ["type:epic", "type:story"]);
});

test("revisão: spec com número antigo do mesmo slug é substituída", () => {
  const dir = workdir();
  mkdirSync(join(dir, "docs/specs"), { recursive: true });
  writeFileSync(join(dir, "docs/specs/3-timer-start-stop.md"), "antigo");
  const r = publish({ cwd: dir, plan: ".esteira/backlog.plan.json" });
  const n = r.stories[0].number;
  assert.ok(existsSync(join(dir, `docs/specs/${n}-timer-start-stop.md`)));
  assert.equal(existsSync(join(dir, "docs/specs/3-timer-start-stop.md")), n === 3);
});
