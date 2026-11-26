#!/usr/bin/env node
// Publica o backlog a partir de um plano JSON escrito pela skill /esteira:backlog.
//
// node backlog.mjs --plan .esteira/backlog.plan.json [--dry-run] [--project <número> --owner <login>] [--cwd repo]
//
// Ordem: valida o plano → garante labels → cria épicos → cria stories (na ordem = prioridade)
// → reescreve o corpo das stories com os IDs AC-<issue>.<n> → checklist no épico
// → (opcional) adiciona ao GitHub Project → escreve docs/specs/<issue>-<slug>.md.
// Idempotente por título: rodar de novo reaproveita issues existentes.
// --dry-run: não toca no GitHub; numera as issues de forma simulada (épicos primeiro) e escreve uma
// prévia em .esteira/specs-preview/ (nunca em docs/specs, para números falsos não irem para o repo).

import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const PLUGIN = fileURLToPath(new URL("../", import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Palavras-chave Gherkin PT: Dado/Dada/Dados/Dadas, Quando, Então, E, Mas. (\b do JS não entende acento, por isso o lookahead.)
const KW = { given: "dad[oa]s?", when: "quando", then: "ent[aã]o", and: "e", but: "mas" };
const startsWith = (kw) => new RegExp(`^(?:${kw})(?=\\s|$)`, "i");
const STEP = startsWith(Object.values(KW).join("|"));
const SCENARIO = /^cen[aá]rio:/i;
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isText = (x) => typeof x === "string" && x.trim() !== "";

export function validatePlan(plan) {
  const errors = [];
  if (!isObj(plan) || !Array.isArray(plan.epics) || plan.epics.length === 0) return ["O plano precisa de pelo menos um épico em `epics`."];
  const slugs = new Set();
  const titles = new Map();
  const seeTitle = (title, where) => {
    const key = String(title).trim().toLowerCase();
    if (titles.has(key)) errors.push(`${where}.title "${title}" repete o título de ${titles.get(key)}; títulos de épicos e stories precisam ser únicos.`);
    else titles.set(key, where);
  };
  let total = 0;
  plan.epics.forEach((e, i) => {
    const where = `epics[${i}]`;
    if (!isObj(e)) { errors.push(`${where} deve ser um objeto.`); return; }
    if (!/^CAP-\d+$/.test(e.cap ?? "")) errors.push(`${where}.cap deve ser CAP-<n> (capacidade do PRD).`);
    if (!isText(e.title)) errors.push(`${where}.title é obrigatório.`);
    else seeTitle(`[${e.cap}] ${e.title}`, where);
    if (!isText(e.description)) errors.push(`${where}.description é obrigatório.`);
    if (!Array.isArray(e.stories) || e.stories.length === 0) { errors.push(`${where} precisa de pelo menos uma story.`); return; }
    e.stories.forEach((s, j) => {
      total++;
      const sw = `${where}.stories[${j}]`;
      if (!isObj(s)) { errors.push(`${sw} deve ser um objeto.`); return; }
      for (const k of ["title", "slug", "asA", "iWant", "soThat", "context"]) if (!isText(s[k])) errors.push(`${sw}.${k} é obrigatório (texto).`);
      if (isText(s.title)) seeTitle(s.title, sw);
      if (isText(s.slug) && !SLUG.test(s.slug)) errors.push(`${sw}.slug "${s.slug}" deve ser kebab-case (a-z, 0-9, -).`);
      if (isText(s.slug) && slugs.has(s.slug)) errors.push(`${sw}.slug "${s.slug}" repetido.`);
      slugs.add(s.slug);
      if (s.outOfScope !== undefined && (!Array.isArray(s.outOfScope) || !s.outOfScope.every(isText))) {
        errors.push(`${sw}.outOfScope deve ser uma lista de textos (ou ser omitido).`);
      }
      if (!Array.isArray(s.acceptance) || s.acceptance.length === 0) { errors.push(`${sw} precisa de pelo menos um critério de aceite.`); return; }
      s.acceptance.forEach((ac, k) => {
        const aw = `${sw}.acceptance[${k}]`;
        if (!isObj(ac)) { errors.push(`${aw} deve ser um objeto { title, gherkin }.`); return; }
        if (!isText(ac.title)) errors.push(`${aw}.title é obrigatório.`);
        if (!isText(ac.gherkin)) { errors.push(`${aw}.gherkin é obrigatório.`); return; }
        const lines = ac.gherkin.split("\n").map((l) => l.trim()).filter(Boolean);
        const has = (kw) => lines.some((l) => startsWith(kw).test(l));
        if (!has(KW.given) || !has(KW.when) || !has(KW.then)) errors.push(`${aw}.gherkin precisa ter linhas Dado, Quando e Então.`);
        const bad = lines.find((l) => !STEP.test(l) && !SCENARIO.test(l));
        if (bad) errors.push(`${aw}.gherkin tem uma linha que não é passo Gherkin: "${bad}".`);
      });
    });
  });
  if (total > 40) errors.push(`O plano tem ${total} stories; o limite é 40. Corte o escopo ou divida em ondas.`);
  return errors;
}

export const acId = (number, k) => `AC-${number}.${k + 1}`;

export function renderGherkin(ac) {
  const steps = String(ac.gherkin).split("\n").map((l) => l.trim()).filter((l) => l && !SCENARIO.test(l));
  return ["```gherkin", `Cenário: ${ac.title}`, ...steps.map((l) => `  ${l}`), "```"].join("\n");
}

export function renderSpec(story, epic, template) {
  const acceptance = story.acceptance
    .map((ac, k) => `#### ${acId(story.number, k)} — ${ac.title}\n\n${renderGherkin(ac)}`)
    .join("\n\n");
  const outOfScope = (story.outOfScope ?? []).length ? story.outOfScope.map((x) => `- ${x}`).join("\n") : "_Nada além do que está fora do escopo do PRD._";
  const values = {
    number: story.number, epic_number: epic.number, epic_title: epic.title, slug: story.slug, title: story.title,
    as_a: story.asA, i_want: story.iWant, so_that: story.soThat, context: story.context, acceptance, out_of_scope: outOfScope,
  };
  return template.replace(/{{(\w+)}}/g, (m, k) => (k in values ? String(values[k]) : m));
}

const SPECS_DIR = "docs/specs";
const PREVIEW_DIR = ".esteira/specs-preview";
export const specPath = (story) => `${SPECS_DIR}/${story.number}-${story.slug}.md`;
const labelNames = (i) => (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));

export function renderStoryBody(story, epic) {
  const acs = story.acceptance.map((ac, k) => `- **${acId(story.number, k)}** — ${ac.title}`).join("\n");
  return [
    `**Como** ${story.asA}, **quero** ${story.iWant}, **para** ${story.soThat}.`,
    `**Épico:** #${epic.number}`,
    `### Critérios de aceite\n\n${acs}`,
    `📄 Spec com os cenários Gherkin: \`${specPath(story)}\``,
  ].join("\n\n") + "\n";
}

export function renderEpicBody(epic) {
  const items = epic.stories.map((s) => `- [ ] #${s.number} ${s.title}`).join("\n");
  return `**Capacidade:** ${epic.cap} (ver \`docs/product/prd.md\`)\n\n${epic.description}\n\n### Stories (em ordem de prioridade)\n\n${items}\n`;
}

const epicTitle = (e) => `[${e.cap}] ${e.title}`;
const numberFromUrl = (url) => Number(/\/issues\/(\d+)\s*$/.exec(url ?? "")?.[1]);

function bodyFile(text) {
  const f = join(mkdtempSync(join(tmpdir(), "esteira-issue-")), "body.md");
  writeFileSync(f, text);
  return f;
}

export function publish(opts) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!opts.plan) return { ok: false, error: "Informe --plan <arquivo.json>." };
  let plan;
  try { plan = JSON.parse(readFileSync(resolve(cwd, opts.plan), "utf8")); }
  catch (e) { return { ok: false, error: `Plano ilegível: ${e.message}` }; }
  const errors = validatePlan(plan);
  if (errors.length) return { ok: false, error: "Plano inválido.", errors };

  const dryRun = Boolean(opts["dry-run"]);
  const warnings = [];
  const epics = plan.epics.map((e) => ({ ...e, stories: e.stories.map((s) => ({ ...s })) }));

  if (dryRun) {
    let n = 0;
    for (const e of epics) e.number = ++n;
    for (const e of epics) for (const s of e.stories) s.number = ++n;
  } else {
    if (!gh(cwd, "repo", "view", "--json", "nameWithOwner").ok) {
      return { ok: false, error: "GitHub indisponível (repo sem remoto ou gh sem login). Rode com --dry-run para só gerar as specs." };
    }
    const labels = JSON.parse(readFileSync(join(PLUGIN, "templates/labels.json"), "utf8"));
    for (const l of [...labels.types, ...labels.states]) {
      const r = gh(cwd, "label", "create", l.name, "--color", l.color, "--description", l.description, "--force");
      if (!r.ok) warnings.push(`Label ${l.name}: ${r.err}`);
    }
    // Idempotência: só reaproveita issues da própria esteira (com a label do tipo), nunca uma issue qualquer com o mesmo título.
    const existing = {};
    for (const label of ["type:epic", "type:story"]) {
      const listed = gh(cwd, "issue", "list", "--state", "all", "--limit", "1000", "--label", label, "--json", "number,title,url,labels");
      if (!listed.ok) return { ok: false, error: `Não consegui listar as issues com a label ${label} (necessário para não duplicar): ${listed.err}` };
      existing[label] = JSON.parse(listed.out || "[]").filter((i) => labelNames(i).includes(label));
    }
    const find = (title, label) => existing[label].find((i) => i.title === title);

    const create = (title, label, body) => {
      const found = find(title, label);
      if (found) return { number: found.number, url: found.url, created: false };
      const r = gh(cwd, "issue", "create", "--title", title, "--label", label, "--body-file", bodyFile(body));
      if (!r.ok) throw new Error(`gh issue create "${title}": ${r.err}`);
      const url = r.out.split("\n").pop();
      return { number: numberFromUrl(url), url, created: true };
    };

    try {
      for (const e of epics) Object.assign(e, create(epicTitle(e), "type:epic", `**Capacidade:** ${e.cap}\n\n${e.description}\n`));
      for (const e of epics) for (const s of e.stories) Object.assign(s, create(s.title, "type:story", "_Gerando critérios…_\n"));
    } catch (err) {
      return { ok: false, error: err.message, partial: summarize(epics) };
    }
    for (const e of epics) {
      for (const s of e.stories) {
        const r = gh(cwd, "issue", "edit", String(s.number), "--body-file", bodyFile(renderStoryBody(s, e)));
        if (!r.ok) warnings.push(`Corpo da story #${s.number}: ${r.err}`);
      }
      const r = gh(cwd, "issue", "edit", String(e.number), "--body-file", bodyFile(renderEpicBody(e)));
      if (!r.ok) warnings.push(`Corpo do épico #${e.number}: ${r.err}`);
    }
    if (opts.project) {
      const owner = opts.owner ?? "@me";
      for (const item of [...epics, ...epics.flatMap((e) => e.stories)]) {
        const r = gh(cwd, "project", "item-add", String(opts.project), "--owner", owner, "--url", item.url);
        if (!r.ok) { warnings.push(`GitHub Project: ${r.err} (precisa do escopo 'project': gh auth refresh -s project)`); break; }
      }
    }
  }

  // Em dry-run os números são de mentira: a prévia vai para .esteira/specs-preview e nunca para docs/specs.
  const template = readFileSync(join(PLUGIN, "templates/spec.md"), "utf8");
  const dir = dryRun ? PREVIEW_DIR : SPECS_DIR;
  mkdirSync(join(cwd, dir), { recursive: true });
  const files = [];
  for (const e of epics) {
    for (const s of e.stories) {
      const path = `${dir}/${s.number}-${s.slug}.md`;
      for (const old of readdirSync(join(cwd, dir))) {
        if (old !== `${s.number}-${s.slug}.md` && old.replace(/^\d+-/, "") === `${s.slug}.md`) rmSync(join(cwd, dir, old));
      }
      writeFileSync(join(cwd, path), renderSpec(s, e, template));
      files.push(path);
    }
  }
  return { ok: true, simulated: dryRun, ...summarize(epics), files, warnings };
}

function summarize(epics) {
  return {
    epics: epics.map((e) => ({ number: e.number, cap: e.cap, title: e.title, url: e.url ?? null, created: e.created ?? null })),
    stories: epics.flatMap((e) => e.stories.map((s) => ({
      number: s.number, epic: e.number, title: s.title, slug: s.slug, url: s.url ?? null, created: s.created ?? null,
      acceptance: (s.acceptance ?? []).map((ac, k) => (s.number ? acId(s.number, k) : null)),
    }))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = publish(parseArgs(process.argv.slice(2))); }
  catch (err) { result = { ok: false, error: `Falha inesperada: ${err.message}` }; }
  print(result, result.ok ? 0 : 1);
}
