---
"nestjs-openapi": patch
---

A module that lists its controllers or imports through a spread or an identifier, such as `controllers: [...controllers]` with `controllers` an array declared locally or imported, now has them discovered, instead of yielding no operations. Entries computed at runtime are skipped.
