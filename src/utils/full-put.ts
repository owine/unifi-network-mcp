/**
 * Read-merge-write support for UniFi's full-replacement PUT endpoints.
 *
 * Several Integration API PUTs (WiFi broadcasts, networks, firewall policies,
 * ACL rules, DNS policies) replace the whole resource: required fields must all be present, and some
 * optional fields carry meaning when omitted (a missing `dhcpGuarding`
 * disables DHCP guarding; a missing `reportFlowEnabled` reverts to true). A
 * sparse body therefore either fails or silently resets settings.
 *
 * Instead, tools GET the current resource, keep only the fields the PUT body
 * documents (so read-only response fields like id/metadata never leak into the
 * request), and overlay the caller's changes. `undefined` keeps the current
 * value; `null` is sent as an explicit null, which the API uses to clear.
 */

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown, what: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${what} to be a JSON object`);
  }
  return value as JsonObject;
}

export function mergeForPut(
  current: JsonObject,
  updates: JsonObject,
  allowedFields: readonly string[]
): JsonObject {
  const body: JsonObject = {};
  for (const field of allowedFields) {
    if (current[field] !== undefined) body[field] = current[field];
  }
  for (const [field, value] of Object.entries(updates)) {
    if (value !== undefined && allowedFields.includes(field)) body[field] = value;
  }
  return body;
}

/** Fields the caller set that the target variant's PUT body does not accept. */
export function unsupportedFields(
  updates: JsonObject,
  allowedFields: readonly string[]
): string[] {
  return Object.keys(updates).filter(
    (field) => updates[field] !== undefined && !allowedFields.includes(field)
  );
}

/** Required fields that are absent (undefined or null) from a request body. */
export function missingFields(
  body: JsonObject,
  requiredFields: readonly string[]
): string[] {
  return requiredFields.filter((field) => body[field] === undefined || body[field] === null);
}

/** Copy only the defined entries, so optional inputs the caller skipped are not sent. */
export function definedEntries(values: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  );
}

const resourceQueues = new Map<string, Promise<void>>();

/**
 * Run one read-merge-write cycle at a time per resource. Agents often split
 * "rename X and enable logging" into parallel calls; unserialised, both read
 * the old resource and the second PUT silently reverts the first change.
 * The queue is per process and keyed on the exact path string, so every
 * writer of a resource (including the firewall-policy PATCH) must lock the
 * same path.
 */
export async function withResourceLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = resourceQueues.get(path) ?? Promise.resolve();
  const run = previous.then(fn);
  const settled = run.then(() => undefined, () => undefined);
  resourceQueues.set(path, settled);
  try {
    return await run;
  } finally {
    if (resourceQueues.get(path) === settled) resourceQueues.delete(path);
  }
}
