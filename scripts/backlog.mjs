#!/usr/bin/env node
// Publica o backlog a partir de um plano JSON escrito pela skill /esteira:backlog.
//
// node backlog.mjs --plan .esteira/backlog.plan.json [--dry-run] [--project <número> --owner <login>] [--cwd repo]
//
// Ordem: valida o plano → garante labels → cria épicos → cria stories (na ordem = prioridade)
// → reescreve o corpo das stories com os IDs AC-<issue>.<n> → checklist no épico
// → (opcional) adiciona ao GitHub Project → escreve docs/specs/<issue>-<slug>.md.
// Idempotente por título: rodar de novo reaproveita issues existentes.
// --dry-run: não toca no GitHub; numera as issues de forma simulada (épicos primeiro) e escreve as specs.

import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { gh, parseArgs, print } from "./lib.mjs";

const PLUGIN = fileURLToPath(new URL("../", import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP = /^(dado|quando|então|entao|e|mas)\b/i;

export function validatePlan(plan) {
  const errors = [];
  if (!plan || !Array.isArray(plan.epics) || plan.epics.length === 0) return ["O plano precisa de pelo menos um épico em `epics`."];
  const slugs = new Set();
  let total = 0;
  plan.epics.forEach((e, i) => {
    const where = `epics[${i}]`;
    if (!/^CAP-\d+$/.test(e.cap ?? "")) errors.push(`${where}.cap deve ser CAP-<n> (capacidade do PRD).`);
    if (!e.title) errors.push(`${where}.title é obrigatório.`);
    if (!e.description) errors.push(`${where}.description é obrigatório.`);
    if (!Array.isArray(e.stories) || e.stories.length === 0) { errors.push(`${where} precisa de pelo menos uma story.`); return; }
    e.stories.forEach((s, j) => {
      total++;
      const sw = `${where}.stories[${j}]`;
      for (const k of ["title", "slug", "asA", "iWant", "soThat", "context"]) if (!s[k]) errors.push(`${sw}.${k} é obrigatório.`);
      if (s.slug && !SLUG.test(s.slug)) errors.push(`${sw}.slug "${s.slug}" deve ser kebab-case (a-z, 0-9, -).`);
      if (s.slug && slugs.has(s.slug)) errors.push(`${sw}.slug "${s.slug}" repetido.`);
      slugs.add(s.slug);
      if (!Array.isArray(s.acceptance) || s.acceptance.length === 0) { errors.push(`${sw} precisa de pelo menos um critério de aceite.`); return; }
      s.acceptance.forEach((ac, k) => {
        const aw = `${sw}.acceptance[${k}]`;
        if (!ac.title) errors.push(`${aw}.title é obrigatório.`);
        const lines = String(ac.gherkin ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        const has = (w) => lines.some((l) => new RegExp(`^${w}\\b`, "i").test(l));
        if (!has("dado") || !has("quando") || !(has("então") || has("entao"))) errors.push(`${aw}.gherkin precisa ter linhas Dado, Quando e Então.`);
        const bad = lines.find((l) => !STEP.test(l) && !/^cen[aá]rio:/i.test(l));
        if (bad) errors.push(`${aw}.gherkin tem uma linha que não é passo Gherkin: "${bad}".`);
      });
    });
  });
  if (total > 40) errors.push(`O plano tem ${total} stories; o limite é 40. Corte o escopo ou divida em ondas.`);
  return errors;
}

export const acId = (number, k) => `AC-${number}.${k + 1}`;

export function renderGherkin(ac) {
  const steps = String(ac.gherkin).split("\n").map((l) => l.trim()).filter((l) => l && !/^cen[aá]rio:/i.test(l));
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

export const specPath = (story) => `docs/specs/${story.number}-${story.slug}.md`;

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
    const listed = gh(cwd, "issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,url,labels");
    const existing = listed.ok ? JSON.parse(listed.out || "[]") : [];
    const find = (title) => existing.find((i) => i.title === title);

    const create = (title, label, body) => {
      const found = find(title);
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

  const template = readFileSync(join(PLUGIN, "templates/spec.md"), "utf8");
  const files = [];
  for (const e of epics) {
    for (const s of e.stories) {
      const path = specPath(s);
      mkdirSync(join(cwd, "docs/specs"), { recursive: true });
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
  const result = publish(parseArgs(process.argv.slice(2)));
  print(result, result.ok ? 0 : 1);
}
