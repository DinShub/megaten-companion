#!/usr/bin/env node
// Validates the committed P5R, P4G, P3R and SMT III datasets against the §8.4 invariants, independent
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

// ---- Persona 4 Golden (public/data/p4g/) -------------------------------------
const P4G_DIR = new URL('../public/data/p4g/', import.meta.url);
const loadP4g = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, P4G_DIR), 'utf8'));
const p4g = {
  personas: loadP4g('personas'),
  skills: loadP4g('skills'),
  shadows: loadP4g('shadows'),
  fusion: loadP4g('fusion-chart'),
  special: loadP4g('special-recipes'),
  inherit: loadP4g('inherit-matrix'),
};
{
  const personaById = new Map(p4g.personas.map((p) => [p.id, p]));
  const p4gSkillIds = idSet(p4g.skills);
  for (const [list, label] of [[p4g.personas, 'p4g persona'], [p4g.skills, 'p4g skill'], [p4g.shadows, 'p4g shadow']]) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) fail(`duplicate ${label} id "${x.id}"`);
      seen.add(x.id);
    }
  }
  const personaRef = (id, where) => {
    if (!personaById.has(id)) fail(`${where}: unresolved p4g persona "${id}"`);
  };
  for (const p of p4g.personas) {
    for (const ls of p.learnedSkills) ref(p4gSkillIds, ls.skillId, `p4g persona ${p.id} learnedSkills`);
    if (Object.keys(p.affinities).length !== 8) fail(`p4g persona ${p.id}: ${Object.keys(p.affinities).length} affinity axes`);
    if (!p4g.inherit[p.inheritType]) fail(`p4g persona ${p.id}: inherit type ${p.inheritType} not in the matrix`);
    if (p.kind === 'special' && !p4g.special.some((r) => r.resultId === p.id)) fail(`p4g special persona ${p.id} has no recipe`);
  }
  for (const s of p4g.skills) if (s.cardPersonaId !== null) personaRef(s.cardPersonaId, `p4g skill ${s.id} card`);
  for (const s of p4g.shadows) for (const id of s.skillIds) ref(p4gSkillIds, id, `p4g shadow ${s.id} skillIds`);
  for (const [name, chart] of [['normal', p4g.fusion.normal], ['triangle', p4g.fusion.triple]]) {
    for (const [a, row] of Object.entries(chart)) {
      for (const [b, r] of Object.entries(row)) {
        if (chart[b]?.[a] !== r) fail(`p4g ${name} chart asymmetric at ${a} × ${b}`);
      }
    }
  }
  for (const r of p4g.special) {
    if (personaById.get(r.resultId)?.kind !== 'special') fail(`p4g special recipe → ${r.resultId}: not a special persona`);
    for (const id of r.ingredientIds) personaRef(id, `p4g special recipe → ${r.resultId}`);
  }
}

// ---- Persona 3 Reload (public/data/p3r/) -------------------------------------
const P3R_DIR = new URL('../public/data/p3r/', import.meta.url);
const loadP3r = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, P3R_DIR), 'utf8'));
const p3r = {
  personas: loadP3r('personas'),
  skills: loadP3r('skills'),
  shadows: loadP3r('shadows'),
  fusion: loadP3r('fusion-chart'),
  special: loadP3r('special-recipes'),
  inherit: loadP3r('inherit-matrix'),
};
{
  const personaById = new Map(p3r.personas.map((p) => [p.id, p]));
  const p3rSkillIds = idSet(p3r.skills);
  for (const [list, label] of [[p3r.personas, 'p3r persona'], [p3r.skills, 'p3r skill'], [p3r.shadows, 'p3r shadow']]) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) fail(`duplicate ${label} id "${x.id}"`);
      seen.add(x.id);
    }
  }
  const personaRef = (id, where) => {
    if (!personaById.has(id)) fail(`${where}: unresolved p3r persona "${id}"`);
  };
  for (const p of p3r.personas) {
    for (const ls of p.learnedSkills) ref(p3rSkillIds, ls.skillId, `p3r persona ${p.id} learnedSkills`);
    if (Object.keys(p.affinities).length !== 10) fail(`p3r persona ${p.id}: ${Object.keys(p.affinities).length} affinity axes`);
    if (!p3r.inherit[p.inheritType]) fail(`p3r persona ${p.id}: inherit type ${p.inheritType} not in the matrix`);
    if (p.kind === 'special' && !p3r.special.some((r) => r.resultId === p.id)) fail(`p3r special persona ${p.id} has no recipe`);
  }
  for (const s of p3r.shadows) for (const id of s.skillIds) ref(p3rSkillIds, id, `p3r shadow ${s.id} skillIds`);
  for (const [a, row] of Object.entries(p3r.fusion.normal)) {
    for (const [b, r] of Object.entries(row)) {
      if (p3r.fusion.normal[b]?.[a] !== r) fail(`p3r chart asymmetric at ${a} × ${b}`);
    }
  }
  for (const r of p3r.special) {
    if (personaById.get(r.resultId)?.kind !== 'special') fail(`p3r special recipe → ${r.resultId}: not a special persona`);
    for (const id of r.ingredientIds) personaRef(id, `p3r special recipe → ${r.resultId}`);
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
    `SMT III: ${smt3.demons.length} demons, ${smt3.skills.length} skills, ${smt3.magatama.length} magatama; charts symmetric, recipes resolve. ` +
    `P4G: ${p4g.personas.length} personas, ${p4g.skills.length} skills, ${p4g.shadows.length} shadows; charts symmetric, recipes resolve. ` +
    `P3R: ${p3r.personas.length} personas, ${p3r.skills.length} skills, ${p3r.shadows.length} shadows; chart symmetric, recipes resolve.`,
);
