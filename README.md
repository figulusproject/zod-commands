# zod-cli-flags

[![CI](https://github.com/figulusproject/zod-cli-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-cli-flags/actions/workflows/ci.yml)
[![NPM version](https://badge.fury.io/js/zod-cli-flags.svg)](http://badge.fury.io/js/zod-cli-flags)

> _Everyone has the right to resist occupation._

Define a CLI's flags once as Zod schemas plus a small sibling metadata object, and get the `node:util` `parseArgs` option config, a typed parse result, and a usage string derived from that single declaration.

## Installation

```sh
npm install zod-cli-flags zod
```

`zod` (v4) is a peer dependency.

## Usage

```ts
import { z } from "zod";
import { defineCli } from "zod-cli-flags";

const cli = defineCli({
  flags: {
    output: { schema: z.string(), description: "Output directory" },
    timeout: { schema: z.coerce.number().int().positive().default(1000) },
    force: { schema: z.boolean().default(false), short: "f" },
    progress: { schema: z.boolean().default(true), negatable: true }, // --progress / --no-progress
    tags: { schema: z.array(z.string()).default([]), multiple: true }, // repeatable --tags
  },
});

const result = cli.parse(process.argv);
if (!result.success) {
  console.error(result.error.message);
  console.error(cli.usage);
  process.exit(1);
}

console.log(result.data);
```

`cli.parse()`/`cli.parseOrExit()` accept either `process.argv` or `process.argv.slice(2)` - the node binary path and script path at the front are detected and stripped automatically if present, so it's safe to pass either.

Or, for a CLI entrypoint that doesn't need the discriminated result for testing:

```ts
const { data } = cli.parseOrExit(process.argv);
```

### Cross-field validation

`.parse()`/`.parseOrExit()` takes an optional second argument: any Zod schema built on top of `cli.flagsSchema`. This is how validation that spans multiple flags plugs in, using Zod transform, refine, or superRefine:

```ts
const overrideSchema = cli.flagsSchema.transform((raw, ctx) => {
  if (raw.min !== undefined && raw.max !== undefined && raw.min > raw.max) {
    ctx.addIssue({ code: "custom", message: "--min must be <= --max" });
    return z.NEVER;
  }
  return raw;
});

cli.parse(argv, overrideSchema);
```

### Flag schemas

`parseArgs` only ever hands a flag's schema one of three raw shapes: a `string`, a `boolean` (only for a bare `z.boolean()`), or a `string[]` (`multiple: true`). Everything else is built by coercing or transforming that raw value:

| Value                         | Schema                                                          | Flag style              |
| ----------------------------- | --------------------------------------------------------------- | ----------------------- |
| String                        | `z.string()`                                                    | `--x <value>`           |
| One of a fixed set of strings | `z.enum([...])`                                                 | `--x json`              |
| Number                        | `z.coerce.number()` (`.int()`/`.min()`/`.max()` chain normally) | `--x <value>`           |
| Bigint                        | `z.coerce.bigint()`                                             | `--x <value>`           |
| Date                          | `z.coerce.date()`                                               | `--x <value>`           |
| Boolean (presence)            | `z.boolean()`, add `negatable: true` for `--no-x`               | `--x` / `--no-x`        |
| Boolean (value-taking)        | `z.stringbool()`                                                | `--x=false`, `--x true` |
| Repeated values               | `z.array(z.string())` + `multiple: true`                        | `--x a --x b`           |
| Comma-separated value         | `z.string().transform((raw) => raw?.split(","))`                | `--x a,b`               |
| Object                        | `z.string().transform(...).pipe(z.object({...}))`               | `--x '{"a":1}'`         |
| One of several shapes         | `z.union()`/`z.discriminatedUnion()`, directly                  | depends on branches     |

A schema without `.optional()`/`.default()` is required - omitting the flag is a parse error, and it's shown without brackets in the auto-generated usage string. `.optional()`/`.default()` short-circuit on a missing flag before any coercion/transform runs, so an omitted flag resolves to `undefined`/the default rather than failing (e.g. on `Number(undefined)`).

**Booleans**: `negatable: true` only applies to a (possibly `.optional()`/`.default()`-wrapped) `z.boolean()` and throws at `defineCli()` time on anything else. `z.stringbool()` parses `"true"`/`"1"`/`"yes"`/`"on"`/`"y"`/`"enabled"` (case-insensitive) as `true` and their negatives as `false` - don't reach for `z.coerce.boolean()` instead, it's plain JS truthiness, so `z.coerce.boolean().parse("false")` is `true` (any non-empty string is truthy). A union of boolean literals doesn't behave like `z.boolean()` either: only a bare `z.boolean()` registers a presence-style parseArgs boolean, so `z.union([z.literal(true), z.literal(false)])` is registered as a value-taking string flag, and fails against the literal string `"true"` it would actually receive.

```ts
progress: { schema: z.boolean().default(true), negatable: true } // --progress / --no-progress
color: { schema: z.stringbool().default(true) }                  // --color=false, --color true
```

**Objects**: `z.object()` doesn't work directly, since `parseArgs` hands it a raw string and `z.object()` expects an actual object. Parse it yourself and pipe into the shape:

```ts
config: {
  schema: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue("Invalid JSON");
        return z.NEVER;
      }
    })
    .pipe(z.object({ hello: z.enum(["world", "earth"]) })),
}
```

### Positionals

```ts
const cli = defineCli({
  flags: { output: { schema: z.string() } },
  positionals: z
    .array(z.string())
    .length(2)
    .transform(([source, destination]) => ({ source, destination })),
});
```

Omit `positionals` and a stray bare argument is a parse error.

`positionals` also accepts `{ schema, label }` to include the positionals in the auto-generated `cli.usage`, prepended before the flags:

```ts
const cli = defineCli({
  flags: { output: { schema: z.string() } },
  positionals: {
    schema: z
      .array(z.string())
      .length(2)
      .transform(([source, destination]) => ({ source, destination })),
    label: "<source> <destination>",
  },
});

cli.usage; // "Usage: <source> <destination> --output <value>"
```

## Copyright

Copyright 2026, Figulus Project.

## License

MIT
