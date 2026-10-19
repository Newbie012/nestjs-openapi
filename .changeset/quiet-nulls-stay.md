---
"nestjs-openapi": patch
---

A property typed `T | null` keeps `null` in its schema when `@IsOptional()` lets null through, even if a class-validator decorator such as `@IsString()` sets its type. Without `@IsOptional()` the validator rejects null, so the schema still leaves it out. A property typed `T | undefined` without `?` is no longer required when it has no class-validator decorators.
