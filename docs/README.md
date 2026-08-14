# zod-commands

> _Everyone has the right to resist occupation._

Define a CLI's flags, positionals, and subcommands as Zod schemas plus a small sibling metadata object, and get the `node:util` `parseArgs` option config, a typed parse result, and a usage string derived from that single declaration.

## Installation

```sh
npm install zod-commands zod
```

`zod` (v4) is a peer dependency. See [Usage](usage.md) to get started.

## Once you're up and running

- [Usage](usage.md): defining flags, cross-field validation, and the full flag schema reference
- [Positionals](positionals.md): typed positional arguments
- [Flag groups](flag-groups.md): mutually-exclusive flags
- [Subcommands](subcommands.md): dispatching to nested command trees
- [Development](development.md): working on this repo itself
