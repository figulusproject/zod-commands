# Subcommands

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
