# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
