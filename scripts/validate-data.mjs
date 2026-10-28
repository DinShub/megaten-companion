#!/usr/bin/env node
// Validates the committed P5R and SMT III datasets against the §8.4 invariants, independent
// of the (gitignored) importer, so CI catches data rot in `public/data/p5r/`
// without re-running the import. Exits non-zero on any failure.
//
// Run: `node scripts/validate-data.mjs`
import { readFileSync } from 'node:fs';

const DIR = new URL('../public/data/p5r/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DIR), 'utf8'));

const personas = load('personas');
const skills = load('skills');
const shadows = load('shadows');
const traits = load('traits');
const accessories = load('accessories');
const fusion = load('fusion-chart');
const advanced = load('advanced-recipes');
const inheritMatrix = load('inherit-matrix');
const classroom = load('classroom');

const errors = [];
const fail = (msg) => errors.push(msg);

const idSet = (list) => new Set(list.map((x) => x.id));
const personaIds = idSet(personas);
const skillIds = idSet(skills);
const shadowIds = idSet(shadows);
const traitIds = idSet(traits);

// 1. No duplicate ids.
for (const [list, label] of [
  [personas, 'persona'],
  [skills, 'skill'],
  [shadows, 'shadow'],
  [traits, 'trait'],
  [accessories, 'accessory'],
]) {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.id)) fail(`duplicate ${label} id: ${x.id}`);
    seen.add(x.id);
  }
}

// 2. Every skillId / personaId / shadowId / traitId reference resolves.
const ref = (set, id, where) => {
  if (id != null && !set.has(id)) fail(`${where}: unresolved reference "${id}"`);
};
for (const p of personas) {
  for (const ls of p.learnedSkills ?? []) ref(skillIds, ls.skillId, `persona ${p.id} learnedSkills`);
  ref(traitIds, p.traitId, `persona ${p.id} traitId`);
  // 6. Every itemization target resolves to a real skill.
  ref(skillIds, p.itemization?.normal, `persona ${p.id} itemization.normal`);
  ref(skillIds, p.itemization?.alarm, `persona ${p.id} itemization.alarm`);
  // 5. Every inheritType exists in the inherit matrix.
  if (!(p.inheritType in inheritMatrix)) {
    fail(`persona ${p.id}: inheritType "${p.inheritType}" not in inherit matrix`);
  }
}
for (const s of skills) {
  for (const cs of s.cardSources ?? []) {
    const set = cs.kind === 'negotiation' ? shadowIds : personaIds;
    ref(set, cs.from, `skill ${s.id} cardSource(${cs.kind})`);
  }
}
for (const sh of shadows) {
  ref(personaIds, sh.personaId, `shadow ${sh.id} personaId`);
  ref(skillIds, sh.drops?.cardSkillId, `shadow ${sh.id} drops.cardSkillId`);
  for (const sid of sh.skillIds ?? []) ref(skillIds, sid, `shadow ${sh.id} skillIds`);
}
for (const a of accessories) ref(skillIds, a.skillId, `accessory ${a.id} skillId`);
for (const r of advanced.recipes ?? []) {
  for (const ing of r.ingredientIds) ref(personaIds, ing, `advanced recipe ${r.resultId} ingredient`);
  ref(personaIds, r.resultId, `advanced recipe resultId`);
}
for (const t of advanced.treasureIds ?? []) ref(personaIds, t, `advanced treasureIds`);

// 3. Fusion chart: all 24 arcana present, and provably symmetric.
const grid = fusion.grid;
const arcana = Object.keys(grid);
if (arcana.length !== 24) fail(`fusion chart has ${arcana.length} arcana rows, expected 24`);
for (const a of arcana) {
  for (const b of arcana) {
    if (grid[a]?.[b] !== grid[b]?.[a]) {
      fail(`fusion chart asymmetric: grid[${a}][${b}]=${grid[a]?.[b]} ≠ grid[${b}][${a}]=${grid[b]?.[a]}`);
    }
  }
}

// 4. Every special persona has an advanced recipe; every treasure persona a prereq.
const advResultIds = new Set((advanced.recipes ?? []).map((r) => r.resultId));
for (const p of personas) {
  if (p.kind === 'special' && !advResultIds.has(p.id)) {
    fail(`special persona ${p.id} has no advanced recipe`);
  }
  if (p.kind === 'treasure' && !p.prereq) fail(`treasure persona ${p.id} has no prereq`);
}

// 7. Classroom answers (§4.5): unique ids/orders, exam consistency, no empties.
{
  const seenId = new Set();
  const seenOrder = new Set();
  for (const c of classroom) {
    if (seenId.has(c.id)) fail(`duplicate classroom id: ${c.id}`);
    seenId.add(c.id);
    if (seenOrder.has(c.order)) fail(`duplicate classroom order: ${c.order}`);
    seenOrder.add(c.order);
    if (c.kind === 'exam' && !c.exam) fail(`classroom ${c.id}: exam question has no exam period`);
    if (c.kind === 'quiz' && c.exam) fail(`classroom ${c.id}: daily question carries an exam period`);
    if (!Array.isArray(c.answers) || c.answers.length === 0) fail(`classroom ${c.id}: has no answer`);
    if (!c.question) fail(`classroom ${c.id}: has no question text`);
    if (!/^https?:\/\//.test(c.source ?? '')) fail(`classroom ${c.id}: missing source URL`);
  }
}

// ---- SMT III: Nocturne (public/data/smt3/) ----------------------------------
const SMT3_DIR = new URL('../public/data/smt3/', import.meta.url);
const loadSmt3 = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, SMT3_DIR), 'utf8'));
const smt3 = {
  demons: loadSmt3('demons'),
  skills: loadSmt3('skills'),
  magatama: loadSmt3('magatama'),
  fusion: loadSmt3('fusion-chart'),
  element: loadSmt3('element-chart'),
  special: loadSmt3('special-recipes'),
};
{
  const demonById = new Map(smt3.demons.map((d) => [d.id, d]));
  const smt3SkillIds = idSet(smt3.skills);
  for (const [list, label] of [[smt3.demons, 'smt3 demon'], [smt3.skills, 'smt3 skill'], [smt3.magatama, 'smt3 magatama']]) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) fail(`duplicate ${label} id: ${x.id}`);
      seen.add(x.id);
    }
  }
  const demonRef = (id, where) => {
    if (!demonById.has(id)) fail(`${where}: unresolved smt3 demon "${id}"`);
  };
  for (const d of smt3.demons) {
    for (const ls of d.learnedSkills) ref(smt3SkillIds, ls.skillId, `smt3 demon ${d.id} learnedSkills`);
    for (const sid of d.enemy?.skillIds ?? []) ref(smt3SkillIds, sid, `smt3 demon ${d.id} enemy.skillIds`);
    if (d.evolvesTo) demonRef(d.evolvesTo.demonId, `smt3 demon ${d.id} evolvesTo`);
    if (d.evolvesFrom) demonRef(d.evolvesFrom.demonId, `smt3 demon ${d.id} evolvesFrom`);
    if (Object.keys(d.affinities).length !== 10) fail(`smt3 demon ${d.id}: ${Object.keys(d.affinities).length} affinity axes`);
  }
  for (const m of smt3.magatama) {
    for (const ls of m.learnedSkills) ref(smt3SkillIds, ls.skillId, `smt3 magatama ${m.id} learnedSkills`);
  }
  for (const [name, chart] of [['normal', smt3.fusion.normal], ['cursed', smt3.fusion.cursed]]) {
    for (const [a, row] of Object.entries(chart)) {
      for (const [b, r] of Object.entries(row)) {
        if (chart[b]?.[a] !== r) fail(`smt3 ${name} chart asymmetric at ${a} × ${b}`);
      }
    }
  }
  for (const [race, id] of Object.entries(smt3.fusion.sameRace)) {
    if (demonById.get(id)?.kind !== 'element') fail(`smt3 same-race ${race}: ${id} is not an Element`);
  }
  for (const m of smt3.element.mitama) {
    if (demonById.get(m.resultId)?.kind !== 'mitama') fail(`smt3 mitama pair → ${m.resultId}: not a Mitama`);
    for (const id of m.ingredientIds) demonRef(id, `smt3 mitama pair → ${m.resultId}`);
  }
  for (const p of smt3.special.pairs) {
    demonRef(p.resultId, 'smt3 special recipe');
    for (const id of p.ingredientIds) demonRef(id, `smt3 special recipe → ${p.resultId}`);
  }
  for (const d of smt3.demons) {
    if (d.kind === 'special' && !smt3.special.pairs.some((p) => p.resultId === d.id)) fail(`smt3 special demon ${d.id} has no recipe`);
    if (d.kind === 'fiend' && !smt3.special.deathstone.some((f) => f.resultId === d.id)) fail(`smt3 fiend ${d.id} has no deathstone entry`);
  }
}

// ---- Report -----------------------------------------------------------------
if (errors.length) {
  console.error(`✗ data validation FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(
  `✓ data validation passed — ${personas.length} personas, ${skills.length} skills, ` +
    `${shadows.length} shadows, ${traits.length} traits, ${accessories.length} accessories, ` +
    `${classroom.length} classroom answers; ` +
    `fusion chart 24×24 symmetric; special/treasure gates and all id references resolve. ` +
    `SMT III: ${smt3.demons.length} demons, ${smt3.skills.length} skills, ${smt3.magatama.length} magatama; charts symmetric, recipes resolve.`,
);
