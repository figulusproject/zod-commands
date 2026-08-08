import type { z } from "zod";

const UNWRAP_TYPES = new Set(["optional", "default", "nullable"]);

// Unwraps optional/default/nullable to the base Zod v4 type tag; z.stringbool() tags as "pipe", not "boolean", so this alone distinguishes presence-based from value-taking boolean flags.
export function baseTypeTag(schema: z.ZodType): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = schema;
  while (current?.def && UNWRAP_TYPES.has(current.def.type)) {
    current = current.def.innerType;
  }
  return current?.def?.type;
}

export function isBooleanSchema(schema: z.ZodType): boolean {
  return baseTypeTag(schema) === "boolean";
}

// Required in the usage string only when omitting the flag would fail validation outright.
export function isOptionalFlag(schema: z.ZodType): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const type = (schema as any)?.def?.type;
  return type === "optional" || type === "default";
}
