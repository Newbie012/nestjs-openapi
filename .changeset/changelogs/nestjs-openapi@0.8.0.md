## 0.8.0

### Minor Changes

- Declarations that share a name are now one schema when their schemas are equal: two copies of a `MoneyDto`, or an interface and a class with the same fields, get one `MoneyDto` component and no warning, and `schemaNameCollision: 'error'` no longer fails on them. Generic instantiations are compared one by one, so `ChoiceDto<string>` from two identical `ChoiceDto<T>` declarations is one `ChoiceDto_string`, and only an instantiation whose bodies differ collides. Descriptions and examples count: copies documented differently still collide. The 'error' message now says where the schemas differ.

  Same-name enums with equal values are one component. An `enumName` given different values in different places is now a collision: 'error' fails, and the other strategies write those values in place.

  Output changes for existing users: with 'rename' or a naming function, equal copies go back to their plain name, and the function is only called for declarations that really differ. With 'inline', equal copies become a referenced component instead of being written in place.

### Patch Changes

- Fix an alias of an array, union or intersection, such as `type ItemList = ItemDto[]`, pointing at another declaration with the same name as its element. It now refers to the declaration it names.
