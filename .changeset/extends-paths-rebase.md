---
"nestjs-openapi": minor
---

With `extends`, the relative paths in a base config (`output`, `files.entry`, `files.tsconfig`, `files.dtoGlob`, and `options.overlay` given as a path) now resolve against the folder of the base config, as tsconfig `extends` does. Before, they resolved against the folder of the config you passed. This only affects setups whose base config is in a different folder and uses relative paths; move those paths so they are relative to the base file. Paths a child config sets itself are unchanged.
