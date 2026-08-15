# zod-introspect

```ts
import { z } from "zod";
import {
  baseTypeTag,
  isBooleanSchema,
  isOptionalOrDefault,
} from "zod-introspect";

baseTypeTag(z.string()); // "string"
baseTypeTag(z.enum(["a", "b"])); // "enum"
baseTypeTag(z.boolean().optional()); // "boolean" - unwraps .optional()/.default()/.nullable()

isBooleanSchema(z.boolean()); // true
isBooleanSchema(z.stringbool()); // false - tagged "pipe", not "boolean"

isOptionalOrDefault(z.string()); // false
isOptionalOrDefault(z.string().optional()); // true
isOptionalOrDefault(z.string().nullable()); // false
```

`isBooleanSchema()` separates a native boolean (`z.boolean()`, coerced or not) from a value-taking one (`z.stringbool()`, which parses strings like `"yes"`/`"0"`) - the two guardrails worth knowing about:

- `z.coerce.boolean()` still returns `true` from `isBooleanSchema()` - coercion doesn't change the base type tag. Its footgun is elsewhere: fed a raw string, it's plain JS truthiness (`Boolean("false")` is `true`), not a parsed boolean. Reach for `z.stringbool()` instead when a string needs to parse as a boolean.
- A union of boolean literals returns `false` too - only a bare `z.boolean()` (through the optional/default/nullable unwrap) counts.

`isOptionalOrDefault()` is true only when omitting a value wouldn't fail validation outright - `.nullable()` alone doesn't count, since it only means `null` is an acceptable _provided_ value, not that a value can be left out.
