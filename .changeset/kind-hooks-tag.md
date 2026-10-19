---
"nestjs-openapi": minor
---

New `options.operationExtensions` adds `x-` extensions to each operation from a function. It gets the operation's HTTP method, final path, operationId, controller, method, module and `files.entry`, plus the decorators on the method and the controller with their arguments evaluated statically, so `@Roles('admin')` can become `x-roles: ['admin']`. Keys set with `@ApiExtension` win over the returned ones, and a name without the `x-` prefix fails generation. The `OperationContext`, `OperationExtensions` and `OperationExtensionsHook` types are exported.
