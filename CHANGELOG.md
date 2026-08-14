# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-08-14

### Changed

- Package renamed from `zod-cli-flags` to `zod-commands`.
- `flags` is now optional on `defineCli()`, matching `defineCommands()`, for CLIs that only take positionals.

### Added

- `defineCommands()`: dispatches argv's leading token to a named subcommand, each an ordinary `defineCli()` (or a nested `defineCommands()` for arbitrarily deep command trees). Returns a discriminated `{ success: true, command, global, data, positionals } | { success: false, command?, error }` result, with `command` the full path from root to the resolved leaf. Also accepts its own `flags`/`exclusiveGroups`, parsed from whatever precedes the command name and merged into `result.global` across nesting levels (innermost wins on a key collision). `cli.parseOrExit()` prints the most specific usage available (the resolved subcommand's own usage, or the command list) and exits 1 on failure.
- `exclusiveGroups` option on `defineCli()`: marks a set of flags as mutually exclusive (at most one, or exactly one with `required: true`), enforced at parse time and rendered in the auto-generated usage string as `(--a <value> | --b <value>)` or `[--a <value> | --b <value>]`.
- Docs: a docsify-based documentation site under `docs/`, published at https://zodcommands.figulus.dev, with dedicated pages for usage, positionals, flag groups, subcommands, and repo development.
- Test coverage tracking via `npm run coverage` (vitest, v8 provider), enforced as a minimum threshold in CI, with a coverage badge in the README kept up to date on pushes to main.

## [1.0.3] - 2026-08-14

### Deprecated

- Renamed to `zod-commands`. `zod-cli-flags` won't receive further updates, and has been deprecated in favour of the new package name.

## [1.0.2] - 2026-08-09

### Added

- `placeholder?: string` flag descriptor field: overrides the `<value>` placeholder in the auto-generated usage string (e.g. `<dir>`) for a value-taking flag.

## [1.0.1] - 2026-08-09

### Added

- `positionals` now also accepts `{ schema, label }`; when a `label` is given, `buildUsage()`/`cli.usage` prepends it before the flag list instead of silently omitting positionals.

## [1.0.0] - 2026-08-08

### Added

- CI workflow (`ci.yml`): runs typecheck, tests, and format checks on push/PR across Node 20/22/24.

### Changed

- First stable release - no functional changes from `0.1.0`.

## [0.1.0] - 2026-08-08

### Added

- `defineCli()`: declare a flat set of CLI flags as Zod schemas plus a small sibling metadata object (`long`, `short`, `multiple`, `negatable`, `description`), and derive a `node:util` `parseArgs` option config, a typed parse result, and a usage string from that single declaration.
- `cli.parse(argv, overrideFlagsSchema?)`: returns a discriminated `{ success: true, data, positionals } | { success: false, error }` result and never calls `process.exit`.
- `cli.parseOrExit(argv, overrideFlagsSchema?)`: prints the error message and usage to stderr and calls `process.exit(1)` on failure; returns `{ data, positionals }` directly on success.
- `cli.parse()`/`cli.parseOrExit()` accept either raw `process.argv` or pre-sliced argv - the node binary path and script path at the front are detected and stripped automatically when present.
- `negatable: true` flag descriptor field: registers a `--no-x` counterpart for a `z.boolean()` flag, resolved to a single `true | false | undefined` before the schema runs; passing both `--x` and `--no-x` is a parse error, and `negatable: true` on a non-boolean schema throws at `defineCli()` time.
- `multiple: true` flag descriptor field: collects repeated occurrences of a flag into a `string[]`.
- `positionals` option: validate/transform the positional argument array via any Zod schema.
- Cross-field validation via an optional second argument to `.parse()`/`.parseOrExit()`: any Zod schema built on `cli.flagsSchema` (`.transform()`, `.check()`, `.superRefine()`, etc).
- Auto-generated `cli.usage` string, overridable via `defineCli({ usage })`.
