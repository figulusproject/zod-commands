import type { z } from "zod";
import { baseTypeTag, isBooleanSchema } from "zod-introspect";
import type { QuestionDescriptor } from "./types.js";

export type Widget = "text" | "confirm" | "select" | "multiselect" | "password";

const UNWRAP_TYPES = new Set(["optional", "default", "nullable"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(schema: z.ZodType): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = schema;
  while (current?.def && UNWRAP_TYPES.has(current.def.type)) {
    current = current.def.innerType;
  }
  return current;
}

export function widgetFor(key: string, descriptor: QuestionDescriptor): Widget {
  if (descriptor.secret) return "password";
  if (isBooleanSchema(descriptor.schema)) return "confirm";

  const tag = baseTypeTag(descriptor.schema);

  if (descriptor.multiselect) {
    if (tag !== "array") {
      throw new Error(
        `zod-questions: question "${key}" has multiselect: true but its schema isn't an array (got a schema tagged "${tag}"). multiselect requires z.array(z.enum([...])).`,
      );
    }
    return "multiselect";
  }

  if (tag === "array") {
    throw new Error(
      `zod-questions: question "${key}"'s schema is an array, but neither multiselect: true nor a .transform() from a string was given. Add multiselect: true for a fixed set of choices, or transform a string (e.g. comma-separated) into the array instead.`,
    );
  }

  if (tag === "enum") return "select";
  return "text";
}

export function enumOptions(
  schema: z.ZodType,
  labels?: Record<string, string>,
): { value: string; label: string }[] {
  const enumSchema = unwrap(schema) as { options: string[] };
  return enumSchema.options.map((value) => ({
    value,
    label: labels?.[value] ?? value,
  }));
}

export function multiselectOptions(
  schema: z.ZodType,
  labels?: Record<string, string>,
): { value: string; label: string }[] {
  const arraySchema = unwrap(schema) as { element: z.ZodType };
  return enumOptions(arraySchema.element, labels);
}
