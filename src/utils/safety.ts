import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { noteRefusal } from "../write-log.js";

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

/**
 * A dry run's result. confirmationRequired is the reason the real call needs
 * confirm, if it does: the preview is what the user approves, so it has to
 * say that the change opens access before they approve it, not after.
 */
export function formatDryRun(
  method: string,
  path: string,
  body?: unknown,
  confirmationRequired?: string
): { content: { type: "text"; text: string }[]; structuredContent: Record<string, unknown> } {
  const preview = {
    dryRun: true,
    wouldExecute: { method, path, ...(body !== undefined ? { body } : {}) },
    ...(confirmationRequired !== undefined ? { confirmationRequired } : {}),
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

/** How a rule in an evaluation order treats the traffic it matches. */
export interface RuleEffect {
  letsThrough: boolean;
  blocks: boolean;
}

/**
 * Whether a reorder opens access: whether it moves a rule that lets traffic
 * through ahead of one that blocks, which it used to follow. Only rules in
 * both orders are compared, and effect is asked only about the rules a
 * reorder actually moves past one another. IDs are compared without case.
 */
export async function reorderOpens(
  before: readonly string[],
  after: readonly string[],
  effect: (id: string) => Promise<RuleEffect>
): Promise<boolean> {
  const rank = new Map(before.map((id, index) => [id.toLowerCase(), index]));
  const passes: [string, string][] = [];
  after.forEach((ahead, i) => {
    for (const behind of after.slice(i + 1)) {
      const [was, other] = [rank.get(ahead.toLowerCase()), rank.get(behind.toLowerCase())];
      if (was !== undefined && other !== undefined && was > other) passes.push([ahead, behind]);
    }
  });
  const ids = [...new Set(passes.flat())];
  const effects = new Map(await Promise.all(ids.map(async (id) => [id, await effect(id)] as const)));
  return passes.some(([ahead, behind]) => effects.get(ahead)?.letsThrough === true && effects.get(behind)?.blocks === true);
}

export function requireConfirmation(
  confirm: boolean | undefined,
  action: string
): { content: { type: "text"; text: string }[]; isError: true } | null {
  if (confirm !== true) {
    noteRefusal("confirmation_required");
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
