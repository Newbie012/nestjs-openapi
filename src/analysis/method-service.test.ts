import { describe, it, expect } from 'vitest';
import { Effect, Option } from 'effect';
import { Project } from 'ts-morph';
import { MethodExtractionService } from './methods.js';

describe('MethodExtractionService', () => {
  it('provides getControllerMethodInfos accessor via Default layer', async () => {
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
    const result = await Effect.runPromise(
      MethodExtractionService.getControllerMethodInfos(controller).pipe(
        Effect.provide(MethodExtractionService.Default),
      ),
    );

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/users/:id');
    expect(result[0].httpMethod).toBe('GET');
    expect(Option.isNone(result[0].httpCode)).toBe(true);
  });
});
