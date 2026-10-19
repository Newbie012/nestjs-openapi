---
"nestjs-openapi": patch
---

`@Param() params: SomeDto` now gives one path parameter per DTO property, as @nestjs/swagger does, instead of a single parameter named after the argument. A path parameter whose name is not in the route is left out with a warning.
