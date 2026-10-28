/**
 * Tiny shape checks for the {@link StoredValue} validators games declare. Pure
 * and dependency-free so a game definition (eager) can use them without pulling
 * a store or Angular into the initial bundle.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type FieldType = 'string' | 'number' | 'boolean';

/**
 * Check that `data` is an object whose listed fields, *where present*, have the
 * given type. Stores fill missing fields from defaults, so absence is fine; a
 * wrong type is not. Returns a readable reason, or null.
 */
export function checkFields(data: unknown, fields: Readonly<Record<string, FieldType>>): string | null {
  if (!isRecord(data)) return 'it isn’t a valid record.';
  for (const [name, type] of Object.entries(fields)) {
    if (!(name in data)) continue;
    const value = data[name];
    if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) {
      return `“${name}” is invalid.`;
    }
  }
  return null;
}

/** Check that `data[field]`, where present, is an object of booleans (unlock-group toggles). */
export function checkFlags(data: Record<string, unknown>, field: string): string | null {
  if (!(field in data)) return null;
  const flags = data[field];
  if (!isRecord(flags) || Object.values(flags).some((v) => typeof v !== 'boolean')) {
    return `“${field}” is invalid.`;
  }
  return null;
}
