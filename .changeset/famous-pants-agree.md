---
'@builder.io/sdk': patch
'@builder.io/react': patch
---

Fix: Content API invocations will have `includeRefs` set to `true` by default and will not have `enrich` as part of its query-params