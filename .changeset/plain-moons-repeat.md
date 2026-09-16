---
'nestjs-openapi': patch
---

Emit 3.1-native schema shapes when targeting OpenAPI 3.1+: `const` for single-value literals, a bare `$ref` inside the nullable union, and `contentMediaType`/`contentEncoding` instead of `format: binary`/`byte`. Output for 3.0.3 is unchanged.
