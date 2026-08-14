# zod-cli-flags

[![CI](https://github.com/figulusproject/zod-cli-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-cli-flags/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodcliflags.figulus.dev/coverage-badge.json)](https://github.com/figulusproject/zod-cli-flags/actions/workflows/ci.yml)
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

The `<value>` placeholder shown for value-taking flags can be overridden per-flag with `placeholder`:

```ts
dir: { schema: z.string(), placeholder: "dir" } // --dir <dir>
```

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

### Flag groups

`exclusiveGroups` marks a set of flags as mutually exclusive - at most one may be passed, or, with `required: true`, exactly one must be:

```ts
const cli = defineCli({
  flags: {
    ids: { schema: z.array(z.string()).optional(), multiple: true },
    idsFile: { schema: z.string().optional(), long: "ids-file" },
  },
  exclusiveGroups: [{ flags: ["ids", "idsFile"], required: true }],
});

cli.usage; // "Usage: (--ids <value>... | --ids-file <value>)"
```

Passing more than one member is a parse error ("--ids and --ids-file are mutually exclusive."). With `required: true`, passing none is too ("One of --ids or --ids-file is required."). `cli.usage` renders the group as `(...)` when required or `[...]` when optional, joining members with `|` instead of listing them separately.

Each member's own schema must be `.optional()`/`.default()` - the group is what makes a member optional, so a member with a schema that's required on its own would otherwise fail validation whenever a sibling is chosen instead. `defineCli()` throws immediately if a member's schema isn't optional/default, if a group has fewer than 2 flags, or if a flag appears in more than one group.

### Subcommands

`defineCommands()` dispatches argv's leading token to one of several named subcommands, each an ordinary `defineCli()`:

```ts
import { z } from "zod";
import { defineCli, defineCommands } from "zod-cli-flags";

const cli = defineCommands({
  commands: {
    init: defineCli({
      flags: { template: { schema: z.string().optional() } },
    }),
    build: defineCli({
      flags: { watch: { schema: z.boolean().default(false) } },
      positionals: z.array(z.string()),
    }),
  },
});

const result = cli.parse(process.argv);
if (!result.success) {
  console.error(result.error.message);
  console.error(cli.usage);
  process.exit(1);
}

result.command; // ["init"] | ["build"]
result.data; // { template: string | undefined } | { watch: boolean }, narrowed by result.command
```

An unrecognized or missing command is a parse error ("Unknown command \"x\". Valid commands: init, build." / "A command is required. Valid commands: init, build."). A flag error inside the resolved subcommand (e.g. `mycli init --bogus`) is returned as `{ success: false, command: ["init"], error }` - `command` marks how far dispatch got before the failure.

`cli.parseOrExit()` mirrors `defineCli()`'s: on failure it prints the error and the most specific usage available (the failing subcommand's own `cli.commands.init.usage` when dispatch got that far, otherwise the top-level command list) and calls `process.exit(1)`; on success it returns `{ command, global, data, positionals }` directly.

**Global flags**: `defineCommands()` accepts its own `flags`/`exclusiveGroups`, parsed from whatever precedes the command name (`mycli --verbose init`) and returned under `result.global`:

```ts
const cli = defineCommands({
  flags: { verbose: { schema: z.boolean().default(false), short: "v" } },
  commands: {
    init: defineCli({ flags: { template: { schema: z.string().optional() } } }),
  },
});

cli.parse(["--verbose", "init"]);
// { success: true, command: ["init"], global: { verbose: true }, data: {...}, positionals: [] }
```

**Command trees**: a `commands` entry can itself be another `defineCommands()`, nesting arbitrarily deep. `result.command` is the full path from root to the resolved leaf (`["remote", "add"]`), and `result.global` merges every level's global flags along that path, innermost taking precedence on a key collision:

```ts
const cli = defineCommands({
  commands: {
    remote: defineCommands({
      commands: {
        add: defineCli({ flags: { url: { schema: z.string() } } }),
        remove: defineCli({ flags: { name: { schema: z.string() } } }),
      },
    }),
  },
});

cli.parse(["remote", "add", "--url", "https://example.com"]);
// { success: true, command: ["remote", "add"], global: {}, data: { url: "https://example.com" }, positionals: [] }
```

## Copyright

Copyright 2026, Figulus Project.

## License

MIT
