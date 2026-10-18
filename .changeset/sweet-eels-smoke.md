---
"nestjs-openapi": patch
---

Fix an alias of an array, union or intersection, such as `type ItemList = ItemDto[]`, pointing at another declaration with the same name as its element. It now refers to the declaration it names.
