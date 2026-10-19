## 0.8.2

### Patch Changes

- `@Param() params: SomeDto` now gives one path parameter per DTO property, as @nestjs/swagger does, instead of a single parameter named after the argument. A path parameter whose name is not in the route is left out with a warning.

- class-validator constraints given `{ each: true }` now apply to the array's `items` instead of the array. String keywords from class-validator (`minLength`, `maxLength`, `pattern` and string formats) are no longer written on schemas whose type isn't a string, so `@IsNotEmpty()` on a number adds nothing.
