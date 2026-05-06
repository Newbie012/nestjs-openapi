---
"nestjs-openapi": patch
---

Fix `excludeDecorators` so controller-level decorators exclude all endpoints on the decorated controller, and stop generating placeholder descriptions for parameters and request bodies without explicit descriptions.
