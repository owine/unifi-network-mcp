import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** The confirm input of a DESTRUCTIVE tool. */
export const confirmDestructive = () =>
  z.boolean().optional().describe("Must be true to execute this destructive action; not needed with dryRun: true");

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WRITE_NOT_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export function formatDryRun(
  method: string,
  path: string,
  body?: unknown
): { content: { type: "text"; text: string }[]; structuredContent: Record<string, unknown> } {
  const preview = {
    dryRun: true,
    wouldExecute: { method, path, ...(body !== undefined ? { body } : {}) },
  };
  // structuredContent is required: the SDK rejects a result without it from
  // any tool that declares an outputSchema.
  return {
    content: [{ type: "text", text: JSON.stringify(preview) }],
    structuredContent: preview,
  };
}

/**
 * Confirmation for a write that is routine in general but, with these inputs,
 * opens access — an ALLOW rule, an open SSID, a batch of guest codes. reason
 * says what opens, or is undefined when nothing does; a dry run changes
 * nothing, so it never needs confirming.
 */
export function requireConfirmationIf(
  reason: string | undefined,
  confirm: boolean | undefined,
  dryRun: boolean | undefined
) {
  return reason === undefined || dryRun ? null : requireConfirmation(confirm, reason);
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
