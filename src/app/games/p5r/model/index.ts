/**
 * The §5 domain model for Persona 5 Royal.
 *
 * The committed JSON in `public/data/p5r/` matches these interfaces exactly —
 * every packed string, bitmask and numeric sentinel upstream uses is decoded
 * during import, never in the app. `scripts/import/schema.mjs` mirrors these
 * shapes and the import aborts if the output drifts from them.
 *
 * Documented deltas from §5, each forced by the upstream data:
 *  - `Acquisition` replaces `level: number | 'innate'`, which cannot express the
 *    non-level acquisition tags (`Fa`, `Tk`, `C1`–`Cy`).
 *  - `Trait` is its own dataset; §5 references `traitId` without defining it.
 *  - `Persona.learnedTraits`, `.maxStats`, `Skill.cardLocations`,
 *    `Itemization.normalItem`/`.alarmItem` and `ShadowDrops.items` carry real
 *    upstream data §5 has no field for.
 *  - `Shadow.trait` and persona `resmods` (§14 Q3) are dropped: no feature in §4
 *    reads them.
 */
export * from './ids';
export * from './persona';
export * from './skill';
export * from './shadow';
export * from './fusion';
export * from './classroom';
export * from './user-data';
export * from './meta';
