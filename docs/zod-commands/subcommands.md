# Subcommands

`defineCommands()` dispatches argv's leading token to one of several named subcommands, each an ordinary `defineCli()`:

```ts
import { z } from "zod";
import { defineCli, defineCommands } from "zod-commands";

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

**Per-command override schema**: a `commands` entry can be `{ cli, schema }` instead of a bare `defineCli()`, where `schema` runs in place of `cli`'s own `flagsSchema` - the same role `overrideFlagsSchema` plays in `cli.parse(argv, overrideFlagsSchema)`. This carries cross-field validation (a `.transform()` on `cli.flagsSchema`, for example) through to the subcommand once it's registered under `defineCommands()`:

```ts
const rangeCli = defineCli({
  flags: {
    min: { schema: z.coerce.number().optional() },
    max: { schema: z.coerce.number().optional() },
  },
});
const rangeSchema = rangeCli.flagsSchema.transform((raw, ctx) => {
  if (raw.min !== undefined && raw.max !== undefined && raw.min > raw.max) {
    ctx.addIssue({ code: "custom", message: "--min must be <= --max" });
    return z.NEVER;
  }
  return raw;
});

const cli = defineCommands({
  commands: {
    range: { cli: rangeCli, schema: rangeSchema },
  },
});

cli.parse(["range", "--min", "10", "--max", "5"]);
// { success: false, command: ["range"], error: { message: "--min must be <= --max", ... } }
```
