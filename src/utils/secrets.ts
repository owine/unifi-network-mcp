/**
 * WiFi broadcasts come back from the API with their passphrases in plaintext
 * (`securityConfiguration.passphrase`, and one per VLAN in
 * `securityConfiguration.presharedKeys[].passphrase` on PPSK SSIDs). None of
 * this is in the published docs. Tools redact these values by default so they
 * do not land in LLM transcripts; callers opt in with `includeSecrets: true`.
 */

export const REDACTED = "[REDACTED]";

const SECRET_KEYS = new Set(["passphrase", "password", "secret", "sharedSecret"]);

/** Deep copy of `data` with every secret-named string value replaced by REDACTED. */
export function redactSecrets<T>(data: T): T {
  return redact(data) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEYS.has(key) && typeof entry === "string" ? REDACTED : redact(entry),
    ])
  );
}

/**
 * Replace each REDACTED placeholder in `value` with the real value found at the
 * same path in `current`. This lets a caller echo back a redacted object from a
 * read tool without overwriting the passphrase with the placeholder text.
 * Throws if a placeholder has no real value to restore (e.g. on create, or when
 * a new PPSK entry is added without its passphrase).
 *
 * Array items are matched by index, which is only safe while the item is
 * otherwise unchanged: a reordered `presharedKeys[]` must not hand one VLAN's
 * passphrase to another. So a placeholder inside an array item is restored only
 * when that item equals the current item at the same index apart from secrets.
 */
export function restoreRedacted(value: unknown, current: unknown, path = "body"): unknown {
  if (value === REDACTED) {
    if (typeof current === "string") return current;
    throw new Error(
      `${path} is "${REDACTED}" with no existing value to keep — pass the real secret, or omit the field`
    );
  }
  if (Array.isArray(value)) {
    const currentItems = Array.isArray(current) ? (current as unknown[]) : [];
    return (value as unknown[]).map((item, i) => {
      const itemPath = `${path}[${i}]`;
      if (!containsRedacted(item)) return item;
      if (stableStringify(redact(item)) !== stableStringify(redact(currentItems[i]))) {
        throw new Error(
          `${itemPath} contains "${REDACTED}" but differs from the existing entry at that position — pass the real secret for changed or reordered entries`
        );
      }
      return restoreRedacted(item, currentItems[i], itemPath);
    });
  }
  if (value === null || typeof value !== "object") return value;
  const currentObject =
    current !== null && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      restoreRedacted(entry, currentObject[key], `${path}.${key}`),
    ])
  );
}

export function containsRedacted(value: unknown): boolean {
  if (value === REDACTED) return true;
  if (Array.isArray(value)) return value.some(containsRedacted);
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some(containsRedacted);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  // JSON.stringify returns undefined for undefined and functions, whatever
  // its lib.d.ts signature says.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(",")}}`;
}
