/**
 * Compendium re-summon cost (§6.8, task 38).
 *
 * From upstream's P5 config: `price = 2000 + (sum of base stats)²`. Deliberately
 * over **base** stats, not the registered level — this is upstream's formula, and
 * matching it keeps the `cheapest` route objective (§7.3) shippable rather than
 * speculative.
 */
import type { Stats } from '../model/ids';

export function summonCost(stats: Stats): number {
  const sum = stats.strength + stats.magic + stats.endurance + stats.agility + stats.luck;
  return 2000 + sum * sum;
}
