---
"nestjs-openapi-static": patch
---

Fix ConfigValidationError to include validation issues in the error message. Previously, the CLI only showed "Configuration validation failed: /path/to/config" without the actual validation errors, making it difficult to diagnose configuration problems.
