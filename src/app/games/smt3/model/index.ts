/**
 * The domain model for Shin Megami Tensei III: Nocturne.
 *
 * The committed JSON in `public/data/smt3/` matches these interfaces exactly —
 * every packed resist string, inherit mask and fractional learn level upstream
 * uses is decoded during import (`scripts/import/smt3/`), never in the app.
 */
export * from './ids';
export * from './demon';
export * from './skill';
export * from './fusion';
export * from './user-data';
export * from './meta';
