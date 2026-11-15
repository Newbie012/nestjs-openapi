## 0.11.1

### Patch Changes

- When the schema generator crashes on a property several references away, that property is left out where it is declared. Before, a schema generated again for a name collision could lose the reference that led to it instead, documenting it as any value.

- `options.schemaName` no longer slows generation down: a schema whose name nothing else shares is renamed after it is generated, instead of being generated again under its new name.
