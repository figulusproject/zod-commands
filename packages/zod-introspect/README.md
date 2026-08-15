# zod-introspect

[![CI](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodintake.figulus.dev/coverage-badge.json)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![NPM version](https://badge.fury.io/js/zod-introspect.svg)](http://badge.fury.io/js/zod-introspect)

> _Everyone has the right to resist occupation._

Answers a narrow question about a Zod v4 schema: what does this schema _mean_ to a caller that has to decide how to collect a value for it? Is it a boolean, an enum, something optional, something with a default?

## Installation

```sh
npm install zod-introspect zod
```

`zod` (v4) is a peer dependency.

## Usage

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
isBooleanSchema(z.stringbool()); // false - see the guardrails below

isOptionalOrDefault(z.string()); // false
isOptionalOrDefault(z.string().optional()); // true
isOptionalOrDefault(z.string().default("x")); // true
isOptionalOrDefault(z.string().nullable()); // false - null is acceptable once given, not omittable
```

Two guardrails worth knowing about if you're using this to decide how to collect a boolean:

- `z.coerce.boolean()` is still a native boolean as far as `isBooleanSchema()` is concerned (`true`) - coercion doesn't change the schema's base type tag. The footgun is elsewhere: if a raw _string_ ever reaches it (an env var, a prefilled value), coercion is plain JS truthiness (`Boolean("false")` is `true`), not a parsed boolean. Reach for `z.stringbool()` instead whenever a string needs to parse as a boolean - `isBooleanSchema()` correctly returns `false` for it, since it's a string piped through a transform, not a native boolean.
- A union of boolean literals (`z.union([z.literal(true), z.literal(false)])`) also returns `false` from `isBooleanSchema()` - only a bare `z.boolean()` (through the optional/default/nullable unwrap, coerced or not) counts.

See the [docs site](https://zodintake.figulus.dev/) for the rest.
