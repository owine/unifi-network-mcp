/**
 * Copy only the allowlisted fields of a record. Classic records hold
 * credentials under names no redaction list could anticipate, so the output is
 * built up from the schema's keys and nothing is ever passed through.
 */
export function pick(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}
