---
"nestjs-openapi-static": minor
---

- Inline query DTO properties as individual parameters by default. Use `options.query.style: "ref"` for legacy behavior.
- Add `additionalProperties: false` to object schemas for stricter validation.
