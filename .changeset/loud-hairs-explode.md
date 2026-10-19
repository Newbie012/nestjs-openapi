---
"nestjs-openapi": patch
---

class-validator constraints given `{ each: true }` now apply to the array's `items` instead of the array. String keywords from class-validator (`minLength`, `maxLength`, `pattern` and string formats) are no longer written on schemas whose type isn't a string, so `@IsNotEmpty()` on a number adds nothing.
