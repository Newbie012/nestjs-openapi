---
'nestjs-openapi': minor
---

One schema per declaration, and spec-valid component names.

Output changes for existing users:

- Different declarations sharing a name (two files each declaring an `AddressDto`) no longer share one schema. By default each is written in place where it is used, with a warning; the new `schemaNameCollision` option can name them after their files (`'rename'`), use a naming function, or fail (`'error'`).
- Generic instantiations get valid component names: `Page<User>` becomes `Page_User`. Set `schemas.genericNames: 'raw'` to keep the TypeScript names.
- `MissingGenericSchemaTempFileWriteError` and `MissingGenericSchemaTempFileCleanupError` are no longer exported.
