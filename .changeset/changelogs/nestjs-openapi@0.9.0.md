## 0.9.0

### Minor Changes

- New `options.overlay` applies an OpenAPI Overlay 1.0 document to the generated spec: the overlay object, or the path of a JSON or YAML file relative to the config file. Actions run in order; `update` merges into the objects its JSONPath target selects or appends to arrays, and `remove` deletes them. An action whose target matches nothing fails generation and names the action, or only warns with `overlayUnmatchedTarget: 'warn'`. The overlay's `overlay`, `info` and `actions` fields are checked before anything is applied.

- New `options.operationExtensions` adds `x-` extensions to each operation from a function. It gets the operation's HTTP method, final path, operationId, controller, method, module and `files.entry`, plus the decorators on the method and the controller with their arguments evaluated statically, so `@Roles('admin')` can become `x-roles: ['admin']`. Keys set with `@ApiExtension` win over the returned ones, and a name without the `x-` prefix fails generation. The `OperationContext`, `OperationExtensions` and `OperationExtensionsHook` types are exported.

### Patch Changes

- When `@ApiExtension` sets the same key twice on one method or controller, the topmost decorator now wins, as in @nestjs/swagger, which applies it last.
