# zod-commands

[![CI](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml/badge.svg)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://zodintake.figulus.dev/coverage-badge.json)](https://github.com/figulusproject/zod-intake/actions/workflows/ci.yml)
[![NPM version](https://badge.fury.io/js/zod-commands.svg)](http://badge.fury.io/js/zod-commands)

> _Everyone has the right to resist occupation._

Define a CLI's flags, positionals, and subcommands as Zod schemas plus a small sibling metadata object, and get the `node:util` `parseArgs` option config, a typed parse result, and a usage string derived from that single declaration.

## Installation

```sh
npm install zod-commands zod
```

`zod` (v4) is a peer dependency.

## Usage

```ts
import { z } from "zod";
import { defineCli } from "zod-commands";

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

See the [docs site](https://zodintake.figulus.dev/) for cross-field validation, the full flag schema reference, positionals, mutually-exclusive flag groups, and subcommands.
