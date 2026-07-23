import type { InheritElementId, InheritMatrix, InheritTypeId } from '../model';
import { INHERIT_ELEMENT_ORDER } from '../model/ids';
import {
  acquisitionOrder,
  formatAcquisition,
  formatSkillCost,
  inheritRow,
  titleCase,
  typesThatInherit,
} from './format';

function row(over: Partial<Record<InheritElementId, boolean>>): Record<InheritElementId, boolean> {
  const base = {} as Record<InheritElementId, boolean>;
  for (const e of INHERIT_ELEMENT_ORDER) base[e] = false;
  return { ...base, ...over };
}

const MATRIX = {
  phys: row({ phys: true, gun: true, ailment: true, healing: true }),
  fire: row({ fire: true, ice: false, healing: true }),
  none: row({}),
} as unknown as InheritMatrix;

describe('format helpers', () => {
  it('title-cases a single word', () => {
    expect(titleCase('councillor')).toBe('Councillor');
    expect(titleCase('')).toBe('');
  });

  it('formats each skill cost type', () => {
    expect(formatSkillCost({ type: 'sp', value: 4 })).toBe('4 SP');
    expect(formatSkillCost({ type: 'hp-percent', value: 22 })).toBe('22% HP');
    expect(formatSkillCost({ type: 'gauge', value: 0 })).toBe('Gauge');
    expect(formatSkillCost(null)).toBe('—');
  });

  it('formats and orders acquisitions', () => {
    expect(formatAcquisition({ kind: 'innate', order: 1 })).toBe('Innate');
    expect(formatAcquisition({ kind: 'level', level: 42 })).toBe('Lv 42');
    expect(formatAcquisition({ kind: 'tag', tag: 'Fa' })).toBe('Fa');
    // Innate leads, then by level, then tags last.
    expect(acquisitionOrder({ kind: 'innate', order: 2 })).toBeLessThan(acquisitionOrder({ kind: 'level', level: 1 }));
    expect(acquisitionOrder({ kind: 'level', level: 99 })).toBeLessThan(acquisitionOrder({ kind: 'tag', tag: 'Tk' }));
  });

  it('resolves an inherit row, all-false for an unknown type', () => {
    expect(inheritRow(MATRIX, 'phys')['gun']).toBe(true);
    const missing = inheritRow(MATRIX, 'nope' as InheritTypeId);
    expect(Object.values(missing).every((v) => v === false)).toBe(true);
  });

  it('lists which types can inherit a skill element', () => {
    // Only the fire type has fire === true in the fixture.
    expect(typesThatInherit(MATRIX, 'fire', false)).toEqual(['fire']);
    // phys accepts phys/gun/ailment/healing (§4.3 / task 37 wording).
    expect(typesThatInherit(MATRIX, 'phys', false)).toEqual(['phys']);
    // Unique or non-element-gated skills are inheritable by none.
    expect(typesThatInherit(MATRIX, 'fire', true)).toEqual([]);
    expect(typesThatInherit(MATRIX, null, false)).toEqual([]);
  });
});
