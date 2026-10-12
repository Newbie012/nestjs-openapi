---
"nestjs-openapi": patch
---

Fix two broken refs: a generic with an inline object argument, such as `ApiResponse<{ sent: boolean }>`, is now written in place, and `Map<string, T>`, `Record<string, T>` and `Set<T>` become an object of `T` or an array of unique `T`.
