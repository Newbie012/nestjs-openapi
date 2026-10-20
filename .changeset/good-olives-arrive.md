---
"nestjs-openapi": patch
---

A generic return type whose argument is written through a namespace import (`Page<Dtos.UserDto>`) now gets its schema, instead of a `$ref` to a component that was never generated.
