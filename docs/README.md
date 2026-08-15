# zod-intake

> _Everyone has the right to resist occupation._

Zod schema-driven parsing for how a program takes input from a person, in whatever form that takes: CLI flags, interactive prompts, or the introspection logic shared by both.

## Pick a starting point

- [zod-commands](zod-commands/usage.md): a CLI's flags, positionals, and subcommands, declared as Zod schemas plus a small sibling metadata object
- [zod-questions](zod-questions/usage.md): the same declarative contract, applied to interactive terminal prompts, not `argv`
- [zod-introspect](zod-introspect/usage.md): the shared logic for deciding what a Zod schema _means_ (a boolean? an enum? a value-taking string?), used by both

Each is independently published to npm and independently versioned - install only the one you need.

## Once you're up and running

- [Tasks](zod-questions/tasks.md): zod-questions steps that run a side effect with a status display, rather than collect a typed answer
- [Development](development.md): working on this repo itself
