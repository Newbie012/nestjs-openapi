---
"nestjs-openapi": patch
---

A transparent wrapper alias such as TypeORM's `Relation<T>` (`type Relation<T> = T`) no longer adds a component per use: references point at `T` itself, without the alias's description. A wrapper kept with `aliasRefs: 'preserve'` is named after the declaration it wraps, never after the type checker's internal IDs.
