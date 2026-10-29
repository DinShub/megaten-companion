/**
 * The domain model for Persona 3 Reload.
 *
 * The committed JSON in `public/data/p3r/` matches these interfaces exactly —
 * every packed resist string, chart triangle and fractional learn level upstream
 * uses is decoded during import (`scripts/import/p3r/`), never in the app.
 */
export * from './ids';
export * from './persona';
export * from './skill';
export * from './fusion';
export * from './user-data';
export * from './meta';
