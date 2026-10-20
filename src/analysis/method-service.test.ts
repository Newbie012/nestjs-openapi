import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import { Project } from 'ts-morph';
import { getControllerMethodInfos } from './methods.js';

describe('getControllerMethodInfos', () => {
  it('extracts method infos for a controller', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
        experimentalDecorators: true,
      },
    });

    const sourceFile = project.createSourceFile(
      'method-service.ts',
      `
        function Controller(path?: string): ClassDecorator { return () => {}; }
        function Get(path?: string): MethodDecorator { return () => {}; }

        @Controller('/users')
        class UsersController {
          @Get(':id')
          getUser() {
            return { id: '1' };
          }
        }
      `,
    );

    const controller = sourceFile.getClass('UsersController')!;
    const result = getControllerMethodInfos(controller);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/users/:id');
    expect(result[0].httpMethod).toBe('GET');
    expect(Option.isNone(result[0].httpCode)).toBe(true);
  });
});
