---
"nestjs-openapi": minor
---

New `options.overlay` applies an OpenAPI Overlay 1.0 document to the generated spec: the overlay object, or the path of a JSON or YAML file relative to the config file. Actions run in order; `update` merges into the objects its JSONPath target selects or appends to arrays, and `remove` deletes them. An action whose target matches nothing fails generation and names the action, or only warns with `overlayUnmatchedTarget: 'warn'`. The overlay's `overlay`, `info` and `actions` fields are checked before anything is applied.
