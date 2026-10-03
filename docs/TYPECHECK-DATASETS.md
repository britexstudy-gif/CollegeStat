# Type-checking dataset snapshots

The public snapshots contain tens of thousands of observations. Inferring a
separate TypeScript object type for each JSON row caused the first fresh GitHub
runner to exceed Node's 2 GB heap limit.

The largest snapshots have adjacent `.d.json.ts` declarations. Directory and
ranking consumers use shared record types; program and research consumers use
their existing domain types. Heterogeneous web and student evidence stays
`unknown` until its consumer narrows it. Runtime normalization, import checks and
data tests remain responsible for source contents; these declarations do not
certify a downloaded fact.

`allowArbitraryExtensions` lets TypeScript resolve the declarations without
inferring the full snapshots. Vite and the ingestion tools still read the actual
JSON files. See the [TypeScript configuration reference](https://www.typescriptlang.org/tsconfig/allowArbitraryExtensions.html).

Generated output, build directories and raw working data are excluded from the
compiler. CI type-checks under an explicit 2 GB heap limit to keep this bound
visible. To reproduce a fresh check locally:

```sh
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit --incremental false --extendedDiagnostics
```
