import type { LearnedSkill, Persona } from '../model';
import { defaultEntryFor, nativeSkillsUpTo, newlyAvailableNativeSkills } from './quick-add';

/** Minimal persona fixture — only the fields the quick-add helpers read. */
function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'jack-frost',
    name: 'Jack Frost',
    arcana: 'magician',
    level: 12,
    inheritType: 'ice',
    traitId: 'cold-blooded',
    stats: { strength: 1, magic: 1, endurance: 1, agility: 1, luck: 1 },
    growth: null,
    maxStats: null,
    affinities: { phys: 'neutral', gun: 'neutral', fire: 'weak', ice: 'drain', elec: 'neutral', wind: 'neutral', psy: 'neutral', nuke: 'neutral', bless: 'neutral', curse: 'neutral' },
    learnedSkills: [],
    learnedTraits: [],
    kind: 'normal',
    unlock: null,
    prereq: null,
    itemization: { normal: null, alarm: null, normalItem: null, alarmItem: null },
    ...overrides,
  };
}

const LEARN_SET: LearnedSkill[] = [
  { skillId: 'bufu', kind: 'innate', order: 1 },
  { skillId: 'ice-break', kind: 'innate', order: 2 },
  { skillId: 'mabufu', kind: 'level', level: 14 },
  { skillId: 'bufula', kind: 'level', level: 18 },
  { skillId: 'diamond-dust', kind: 'tag', tag: 'Fa' }, // Fusion Alarm itemization — not native
];

describe('nativeSkillsUpTo', () => {
  it('includes innate skills and level skills at or below the level, in learn order', () => {
    const persona = makePersona({ learnedSkills: LEARN_SET });
    expect(nativeSkillsUpTo(persona, 14)).toEqual(['bufu', 'ice-break', 'mabufu']);
  });

  it('excludes level skills above the level and all tagged (non-native) acquisitions', () => {
    const persona = makePersona({ learnedSkills: LEARN_SET });
    // At base level 12: only innate; mabufu (14) not yet, diamond-dust (Fa) never.
    expect(nativeSkillsUpTo(persona, 12)).toEqual(['bufu', 'ice-break']);
    // Even at max level the Fusion-Alarm card skill is not a native learn.
    expect(nativeSkillsUpTo(persona, 99)).toEqual(['bufu', 'ice-break', 'mabufu', 'bufula']);
  });

  it('de-duplicates a skill learnt twice', () => {
    const persona = makePersona({
      learnedSkills: [
        { skillId: 'bufu', kind: 'innate', order: 1 },
        { skillId: 'bufu', kind: 'level', level: 5 },
      ],
    });
    expect(nativeSkillsUpTo(persona, 10)).toEqual(['bufu']);
  });
});

describe('defaultEntryFor', () => {
  it('proposes base level, the native learn-set to base, and the innate trait', () => {
    const persona = makePersona({ level: 14, learnedSkills: LEARN_SET, traitId: 'cold-blooded' });
    expect(defaultEntryFor(persona)).toEqual({
      personaId: 'jack-frost',
      level: 14,
      skillIds: ['bufu', 'ice-break', 'mabufu'],
      traitId: 'cold-blooded',
    });
  });

  it('carries a null trait through', () => {
    const persona = makePersona({ traitId: null, learnedSkills: [] });
    expect(defaultEntryFor(persona).traitId).toBeNull();
  });
});

describe('newlyAvailableNativeSkills', () => {
  it('suggests native level skills now reached that the entry lacks', () => {
    const persona = makePersona({ learnedSkills: LEARN_SET });
    // Raised to 18, entry still holds only the innate pair.
    const suggestions = newlyAvailableNativeSkills(persona, 18, ['bufu', 'ice-break']);
    expect(suggestions).toEqual([
      { skillId: 'mabufu', level: 14 },
      { skillId: 'bufula', level: 18 },
    ]);
  });

  it('never suggests a skill the entry already carries (manual edits preserved)', () => {
    const persona = makePersona({ learnedSkills: LEARN_SET });
    const suggestions = newlyAvailableNativeSkills(persona, 99, ['bufu', 'ice-break', 'mabufu', 'bufula']);
    expect(suggestions).toEqual([]);
  });

  it('never suggests innate or tagged skills, only level-ups', () => {
    const persona = makePersona({ learnedSkills: LEARN_SET });
    const ids = newlyAvailableNativeSkills(persona, 99, []).map((s) => s.skillId);
    expect(ids).not.toContain('bufu'); // innate
    expect(ids).not.toContain('diamond-dust'); // Fusion Alarm tag
  });
});
