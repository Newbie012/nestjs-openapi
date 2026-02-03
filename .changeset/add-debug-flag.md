---
"nestjs-openapi-static": minor
---

- Add `--debug` CLI flag for verbose logging and stack traces
- Add `debug` option to programmatic API
- Add proper Schema validation for `pathFilter` (RegExp and function types)
- Fix empty glob pattern handling in schema generation
- Improve error messages with context (pattern/file that failed)
