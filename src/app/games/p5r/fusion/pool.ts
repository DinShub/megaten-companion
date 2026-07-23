/**
 * Pool resolution (§6.4, task 31).
 *
 * Turns a {@link FusionContext} into the concrete set of personas usable as raw
 * fusion material. Two modes:
 *
 * | `compendium` | registered personas only, at their registered level |
 * | `obtainable` | the compendium **plus** every fusable persona at or below the protagonist's level |
 *
 * `special`, `party`, and personas in a disabled unlock group are excluded from
 * **both** pools as raw material (§6.4) — even a registered special persona is
 * terminal, matching upstream's model where specials never re-enter fusion. They
 * remain valid *targets*; that is the caller's concern, not the pool's.
 */
import { unlockAllowed } from '../data/indexes';
import type { Persona } from '../model';
import type { FusionContext, PoolMember, ResolvedPool } from './types';

/** A persona may serve as raw material only if it is a plain, unlocked `normal`. */
function usableAsMaterial(persona: Persona, ctx: FusionContext): boolean {
  return persona.kind === 'normal' && unlockAllowed(persona, ctx.unlockGroups);
}

export function resolvePool(
  personas: readonly Persona[],
  ctx: FusionContext,
): ResolvedPool {
  const byId = new Map<PoolMember['personaId'], PoolMember>();
  const personaById = new Map(personas.map((p) => [p.id, p] as const));

  // Compendium contributes every registered, still-usable persona at its
  // registered level. Present in both modes.
  for (const entry of ctx.compendium.values()) {
    const persona = personaById.get(entry.personaId);
    if (!persona || !usableAsMaterial(persona, ctx)) continue;
    byId.set(persona.id, { personaId: persona.id, level: entry.level, owned: true });
  }

  // `obtainable` additionally seeds every fusable persona at or below the
  // protagonist's level, at its base level, flagged unowned (they carry the
  // acquisition penalty the route ranker applies, task 45). Compendium wins on
  // overlap, keeping the registered level and `owned: true`.
  if (ctx.pool === 'obtainable') {
    for (const persona of personas) {
      if (!usableAsMaterial(persona, ctx)) continue;
      if (persona.level > ctx.protagonistLevel) continue;
      if (byId.has(persona.id)) continue;
      byId.set(persona.id, { personaId: persona.id, level: persona.level, owned: false });
    }
  }

  return { mode: ctx.pool, members: [...byId.values()], byId };
}
