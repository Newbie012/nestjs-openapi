import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { indexSchemaClasses } from './generate.js';

describe('indexSchemaClasses', () => {
  it('prefers the class in a schema file over a same-named class added first', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      '/src/legacy.ts',
      'export class ShapeDto {}',
    );
    project.createSourceFile('/src/shape.dto.ts', 'export class ShapeDto {}');

    const index = indexSchemaClasses(
      project,
      new Set(['/src/shape.dto.ts']),
      new Set(['ShapeDto']),
      new Map(),
    );

    expect(index.get('ShapeDto')?.getSourceFile().getFilePath()).toBe(
      '/src/shape.dto.ts',
    );
  });
});
