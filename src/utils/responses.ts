export function formatSuccess(data: unknown, opts?: { structured?: boolean }) {
  const result: {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
  } = {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };

  if (
    opts?.structured &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    result.structuredContent = data as Record<string, unknown>;
  }

  return result;
}

export function formatError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
