### Coding Guidelines

- **Early Exits:** Prefer early returns over `if/else` nesting.
- **Loop Style:** Avoid indexed `for (let ...)` loops; lean on composable helpers like `map`, `flatMap`, `reduce`, or `for...of` when iteration is needed.
- **Ternaries:** Avoid nested ternary operations; favor clear conditional blocks or helper functions instead.
- **Purity:** Favor pure functions (no side effects).
- **Readability:** Avoid inline type distractions.
- **Argument Naming:** functions that have multiple arguments should be called with an object argument to improve readability (logger helpers are the exception).

### Testing Guidelines

- **Explicitness:** When writing tests, explicitly reference both the file name and the test name (if specifically) to ensure clarity and traceability (pnpm vitest run {filename} -t {testname})
