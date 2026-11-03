/**
 * The domain model for Shin Megami Tensei (PS1).
 *
 * The committed JSON in `public/data/smt1/` matches these interfaces exactly —
 * every packed resist string, alignment code and cost code upstream uses is
 * decoded during import (`scripts/import/smt1/`), never in the app.
 */
export * from './ids';
export * from './demon';
export * from './fusion';
export * from './user-data';
export * from './meta';
