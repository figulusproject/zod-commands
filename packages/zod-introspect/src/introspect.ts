import type { z } from "zod";

const UNWRAP_TYPES = new Set(["optional", "default", "nullable"]);

// Unwraps optional/default/nullable to the base Zod v4 type tag. z.stringbool() tags as "pipe", not "boolean", so this alone distinguishes a native boolean from a value-taking one.
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

// True only when omitting a value for this schema wouldn't fail validation outright.
export function isOptionalOrDefault(schema: z.ZodType): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const type = (schema as any)?.def?.type;
  return type === "optional" || type === "default";
}
