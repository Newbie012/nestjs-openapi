---
"nestjs-openapi": patch
---

When `@ApiExtension` sets the same key twice on one method or controller, the topmost decorator now wins, as in @nestjs/swagger, which applies it last.
