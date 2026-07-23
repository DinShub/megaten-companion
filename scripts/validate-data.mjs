#!/usr/bin/env node
// Validates the committed P5R datasets against the §8.4 invariants, independent
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

// ---- Report -----------------------------------------------------------------
if (errors.length) {
  console.error(`✗ data validation FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(
  `✓ data validation passed — ${personas.length} personas, ${skills.length} skills, ` +
    `${shadows.length} shadows, ${traits.length} traits, ${accessories.length} accessories; ` +
    `fusion chart 24×24 symmetric; special/treasure gates and all id references resolve.`,
);
