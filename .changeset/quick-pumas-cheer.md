---
"nestjs-openapi": patch
---

Keep the success response for handlers that declare only error `@ApiResponse` codes.

Previously, a handler without a return type (such as a `@HttpCode(204)` void `DELETE`) that declared only error responses via `@ApiResponse` lost its success response entirely, emitting just the error codes. The default success response is now always documented unless the handler already declares a 2xx response.
