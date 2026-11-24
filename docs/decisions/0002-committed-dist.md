# 0002. Ship the built dist/ in the repository

Date: 2026-11-24  
Status: accepted

## Context

Projects install the library from this Git repository or a local clone, not from a package registry (publishing is an owner decision not yet taken). Installing a TypeScript package from Git needs either a build at install time or prebuilt JavaScript. Build-at-install relies on lifecycle scripts, which pnpm 10 blocks for dependencies by default and which run code at install time. Node does not strip types from files under `node_modules`, so shipping only `.ts` does not work either.

## Decision

Commit `dist/` (JavaScript and declarations built by `tsc`). `npm run check:dist` rebuilds into a temporary directory and fails if `dist/` differs, including files no longer built from `src/`; `npm run verify` and CI run it. The source uses `.ts` import extensions with `rewriteRelativeImportExtensions`, so the examples and tests run the source directly with Node 22.18+.

## Alternatives considered

- **`prepare` script building on install:** no generated files in Git, but slower installs, a TypeScript dev dependency at install time and lifecycle scripts that some package managers block.
- **Publishing to npm:** the cleanest for consumers; deferred until the owner decides on publishing, naming and licensing.

## Consequences

- Every source change needs `npm run build` and a commit of `dist/`; forgetting fails `check:dist`.
- Reviews should skip `dist/`.
- Revisit when the package is published to a registry.
