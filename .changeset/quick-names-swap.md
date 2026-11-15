---
"nestjs-openapi": patch
---

`options.schemaName` no longer slows generation down: a schema whose name nothing else shares is renamed after it is generated, instead of being generated again under its new name.
