---
"nestjs-openapi": minor
---

Generated documents now keep declaration order: paths follow the controllers as they are reached from the entry module, operations and properties follow the class, and component schemas follow the order they are first reached. Before, all of them were sorted A to Z. Set `options.order: 'alphabetical'` to restore the old order. Only key order changes, not values. Expected documents under test/contract change in key order only.
