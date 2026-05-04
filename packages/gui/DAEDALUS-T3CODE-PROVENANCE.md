# Daedalus T3Code Frontend Provenance

This package imports and adapts frontend code from the local T3Code donor checkout.

- Donor path: `/home/likas/Research/gui-inspiration/t3code`
- Donor commit: `0d55a42840231122f8d7414b35f155343031f82d`
- Donor license: MIT License
- Donor copyright: Copyright (c) 2026 T3 Tools Inc.

## Imported areas

- `apps/web/src` -> `packages/gui/src`
- `apps/web/index.html` -> `packages/gui/index.html`
- `apps/web/vite.config.ts` -> `packages/gui/vite.config.ts` (then adapted for Daedalus-local aliases)
- `packages/contracts/src` -> `packages/gui/src/vendor/t3/contracts`
- `packages/shared/src` -> `packages/gui/src/vendor/t3/shared`
- `packages/client-runtime/src` -> `packages/gui/src/vendor/t3/client-runtime`

No donor build outputs, `node_modules`, or server implementation code are intentionally copied.

## Fidelity rules

1. Preserve the imported T3Code frontend structure, route/component names, and visual implementation unless a later Daedalus task explicitly adapts a backend seam.
2. Keep T3 helper code vendored under `packages/gui/src/vendor/t3`; production Daedalus GUI code must not import from the donor checkout path.
3. Replace package imports for `@t3tools/contracts`, `@t3tools/shared/*`, and `@t3tools/client-runtime` with local TypeScript/Vite aliases rather than external workspace dependencies.
4. Document backend/runtime behavior gaps instead of visually rewriting copied frontend code during the import task.
5. Retain MIT license attribution for copied T3Code portions in this provenance file.

## Boundary enforcement

Run `bun scripts/check-gui-import-boundaries.ts` from the repository root to verify that production GUI source does not import from the donor checkout, `third_party/t3code-upstream`, T3 server paths, Electron, or Daedalus app-server internals. The root `check:gui` script runs this boundary check before GUI typechecking.

## MIT license text

MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
