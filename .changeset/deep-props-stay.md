---
"nestjs-openapi": patch
---

When the schema generator crashes on a property several references away, that property is left out where it is declared. Before, a schema generated again for a name collision could lose the reference that led to it instead, documenting it as any value.
