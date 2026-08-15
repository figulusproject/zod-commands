# Development

This is an npm workspaces monorepo: one `npm install` at the root covers every package under `packages/`.

```bash
npm install
npm run build       # tsc -b, builds every package via TS project references
npm run typecheck   # tsc -b --force
npm test            # vitest run, across every package
npm run coverage    # vitest run --coverage, across every package
npm run format      # prettier --write .
```

## Adding a package

Create `packages/<name>/` with its own `package.json` and a `tsconfig.json` that `extends` the root `tsconfig.base.json`, then add it to the root `tsconfig.json`'s `references` array (in dependency order) so `tsc -b` picks it up.

## Docs

This site is built with [docsify](https://docsify.js.org) and lives under `docs/`, with no build step - docsify renders the Markdown client-side.

```bash
npm run docs
```

Serves the site at `http://localhost:3000` with live reload. Pass a different port with `npm run docs -- --port <port>`.

## Versioning

Each package versions independently for now - `npm run sync-versions -- <version>` bumps every package to the same version and pins internal cross-workspace dependencies to it, for when they're ready to move in lockstep, but isn't part of the normal release flow yet.
