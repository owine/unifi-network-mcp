import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};

export const WRITE_NOT_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
};

export function formatDryRun(
  method: string,
  path: string,
  body?: unknown
): { content: { type: "text"; text: string }[] } {
  const preview = {
    dryRun: true,
    wouldExecute: { method, path, ...(body !== undefined ? { body } : {}) },
  };
  return {
    content: [{ type: "text", text: JSON.stringify(preview, null, 2) }],
  };
}

export function requireConfirmation(
  confirm: boolean | undefined,
  action: string
): { content: { type: "text"; text: string }[]; isError: true } | null {
  if (confirm !== true) {
    return {
      content: [
        {
          type: "text",
          text: `This action requires explicit confirmation: ${action}. Re-invoke with confirm: true to proceed.`,
        },
      ],
      isError: true,
    };
  }
  return null;
}
