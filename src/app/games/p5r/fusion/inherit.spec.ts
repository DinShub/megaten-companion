import type { InheritMatrix, Skill } from '../model';
import type { InheritElementId, InheritTypeId, SkillElementId } from '../model/ids';
import { INHERIT_ELEMENT_ORDER } from '../model/ids';
import { canInherit, skillEligibility } from './inherit';

/**
 * Task 37 asserts the §6.5 **table** (transcribed into `inherit-matrix.json`),
 * not the §6.5 prose — the prose is inverted (see the project memo
 * "inherit-matrix-prose-vs-table"). An elemental type blocks the *opposing*
 * element: `fire` inherits fire but not ice; `phys` accepts only
 * phys/gun/ailment/healing. These fixtures copy the real matrix rows.
 */
function row(over: Partial<Record<InheritElementId, boolean>>, fill: boolean): Record<InheritElementId, boolean> {
  const base = {} as Record<InheritElementId, boolean>;
  for (const e of INHERIT_ELEMENT_ORDER) base[e] = fill;
  return { ...base, ...over };
}

const MATRIX: InheritMatrix = {
  fire: row({ ice: false }, true), // blocks ice, its opposite
  ice: row({ fire: false }, true), // blocks fire, its opposite
  phys: row({ phys: true, gun: true, ailment: true, healing: true }, false),
  almighty: row({}, true),
  none: row({}, false),
  // remaining types unused by these tests but required by the type
  elec: row({ wind: false }, true),
  wind: row({ elec: false }, true),
  psy: row({ nuke: false }, true),
  nuke: row({ psy: false }, true),
  bless: row({ phys: false, gun: false, curse: false, ailment: false }, true),
  curse: row({ phys: false, gun: false, bless: false, healing: false }, true),
  ailment: row({ bless: false, healing: false }, true),
  healing: row({ phys: false, gun: false, curse: false }, true),
  support: row({}, true),
};

function skill(over: Partial<Skill> & Pick<Skill, 'id' | 'inheritElement'>): Skill {
  return {
    name: over.id,
    element: (over.inheritElement ?? 'almighty') as SkillElementId,
    cost: null,
    target: '1 foe',
    description: '',
    rank: 10,
    unique: false,
    cardLocations: [],
    cardSources: [],
    ...over,
  } as Skill;
}

const T = (id: InheritTypeId) => id;

describe('canInherit / skillEligibility (§6.5, task 37)', () => {
  it('a fire persona CAN inherit fire skills and CANNOT inherit ice — the matrix, not the prose', () => {
    const agi = skill({ id: 'agi', inheritElement: 'fire' });
    const bufu = skill({ id: 'bufu', inheritElement: 'ice' });

    expect(canInherit(MATRIX, T('fire'), agi)).toBe(true);
    expect(canInherit(MATRIX, T('fire'), bufu)).toBe(false);

    expect(skillEligibility(MATRIX, T('fire'), bufu)).toEqual({
      skillId: 'bufu',
      eligible: false,
      reason: 'blocked-element',
      blockingElement: 'ice',
    });
  });

  it('phys accepts only phys / gun / ailment / healing', () => {
    const accepted: InheritElementId[] = ['phys', 'gun', 'ailment', 'healing'];
    const rejected: InheritElementId[] = ['fire', 'ice', 'elec', 'wind', 'psy', 'nuke', 'bless', 'curse'];

    for (const el of accepted) {
      expect(canInherit(MATRIX, T('phys'), skill({ id: el, inheritElement: el }))).toBe(true);
    }
    for (const el of rejected) {
      expect(canInherit(MATRIX, T('phys'), skill({ id: el, inheritElement: el }))).toBe(false);
    }
  });

  it('unique skills are never inheritable, whatever the type', () => {
    const megidolaon = skill({ id: 'megidolaon', inheritElement: null, unique: true });
    expect(canInherit(MATRIX, T('almighty'), megidolaon)).toBe(false);
    expect(skillEligibility(MATRIX, T('almighty'), megidolaon)).toEqual({
      skillId: 'megidolaon',
      eligible: false,
      reason: 'unique',
    });
  });

  it('null-element skills are not element-gated — only unique blocks them', () => {
    const invigorate = skill({ id: 'invigorate-3', inheritElement: null }); // a passive
    // Even `none`, which grants no elements, receives an ungated skill (upstream's
    // "no inherit bit ⇒ always inheritable" branch).
    expect(canInherit(MATRIX, T('none'), invigorate)).toBe(true);
    expect(canInherit(MATRIX, T('phys'), invigorate)).toBe(true);
    expect(skillEligibility(MATRIX, T('none'), invigorate)).toEqual({
      skillId: 'invigorate-3',
      eligible: true,
    });
  });

  it('an element-gated skill is blocked by `none` and passed by `almighty`', () => {
    const garu = skill({ id: 'garu', inheritElement: 'wind' });
    expect(canInherit(MATRIX, T('almighty'), garu)).toBe(true);
    expect(canInherit(MATRIX, T('none'), garu)).toBe(false);
  });
});
