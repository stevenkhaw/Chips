const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Converts a snake_case SQL row to camelCase. Does not coerce types; callers fix booleans. */
export function mapRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) out[snakeToCamel(k)] = row[k];
  return out as T;
}
