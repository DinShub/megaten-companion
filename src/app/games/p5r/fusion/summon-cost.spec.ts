import type { Stats } from '../model/ids';
import { summonCost } from './summon-cost';

describe('summonCost (§6.8, task 38)', () => {
  it('is 2000 + (sum of base stats)²', () => {
    // Pixie's committed base stats: 1+3+3+4+2 = 13 → 2000 + 169 = 2169.
    const pixie: Stats = { strength: 1, magic: 3, endurance: 3, agility: 4, luck: 2 };
    expect(summonCost(pixie)).toBe(2169);
  });

  it('squares the whole sum, not each stat', () => {
    const stats: Stats = { strength: 10, magic: 0, endurance: 0, agility: 0, luck: 0 };
    expect(summonCost(stats)).toBe(2000 + 100); // (10)² = 100, not 10²+0+…
  });

  it('has a floor of 2000 at zero stats', () => {
    expect(summonCost({ strength: 0, magic: 0, endurance: 0, agility: 0, luck: 0 })).toBe(2000);
  });
});
