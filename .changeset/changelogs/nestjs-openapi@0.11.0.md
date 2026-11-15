## 0.11.0

### Minor Changes

- New `options.schemaName` chooses the component name of each class, interface, enum and type alias, for example to strip a `Dto` suffix from the classes in one folder. Every `$ref` follows the new name, and two declarations given the same name go through `schemaNameCollision`. Collision functions now also receive `declaredName`.
