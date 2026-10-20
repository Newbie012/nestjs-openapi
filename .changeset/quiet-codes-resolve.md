---
"nestjs-openapi": patch
---

A parameter, body or return type that uses an enum from a library, such as `HttpStatus` from `@nestjs/common`, now produces its schema. Before, the `$ref` pointed at a schema that was never written, so validation failed whenever the enum appeared only outside the DTO files.
