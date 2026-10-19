---
"nestjs-openapi": patch
---

A class that shares its name with a documented declaration no longer adds its class-validator metadata to that declaration's schema. Generation now reports a schema whose `required` lists a key its `properties` does not.
