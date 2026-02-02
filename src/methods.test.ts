import { describe, it, expect, beforeEach } from 'vitest';
import { Option } from 'effect';
import {
  Project,
  MethodDeclaration,
  ScriptTarget,
  ClassDeclaration,
} from 'ts-morph';
import { getMethodInfo } from './methods.js';
import type { MethodInfo } from './domain.js';

class TestSetup {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ScriptTarget.Latest,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    });
  }

  createControllerWithMethod(code: string): {
    controller: ClassDeclaration;
    method: MethodDeclaration;
  } {
    const sourceFile = this.project.createSourceFile(
      `test-${Date.now()}.ts`,
      code,
    );
    const controller = sourceFile.getClasses()[0];
    const method = controller.getMethods()[0];
    return { controller, method };
  }

  getMethodInfo(code: string): MethodInfo | undefined {
    const { controller, method } = this.createControllerWithMethod(code);
    const result = getMethodInfo(controller, method);
    return Option.isSome(result) ? result.value : undefined;
  }
}

describe('getMethodInfo', () => {
  let testSetup: TestSetup;

  beforeEach(() => {
    testSetup = new TestSetup();
  });

  describe('Path parameter transformation', () => {
    it('should preserve :param syntax in paths', () => {
      const code = `
        import { Controller, Get, Param } from '@nestjs/common';

        @Controller('/api/users')
        class UsersController {
          @Get(':id/profile/:section')
          getUserProfile(@Param('id') id: string, @Param('section') section: string) {
            return { id, section };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.path).toBe('/api/users/:id/profile/:section');
      expect(info?.httpMethod).toBe('GET');
    });

    it('should handle root paths correctly', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.path).toBe('/users');
    });
  });

  describe('Parameter extraction with descriptions', () => {
    it('should extract query parameters with @ApiQuery descriptions', () => {
      const code = `
        @Controller('/search')
        class SearchController {
          @Get()
          @ApiQuery({ name: 'limit', description: 'Maximum number of results', required: false })
          @ApiQuery({ name: 'offset', description: 'Number of results to skip', required: false })
          search(
            @Query('limit') limit?: number,
            @Query('offset') offset?: number,
          ) {
            return { limit, offset };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(2);

      const limitParam = info?.parameters.find((p) => p.name === 'limit');
      expect(limitParam).toBeDefined();
      expect(limitParam?.location).toBe('query');
      expect(Option.getOrNull(limitParam!.description)).toBe(
        'Maximum number of results',
      );
      expect(limitParam?.required).toBe(false);

      const offsetParam = info?.parameters.find((p) => p.name === 'offset');
      expect(offsetParam).toBeDefined();
      expect(Option.getOrNull(offsetParam!.description)).toBe(
        'Number of results to skip',
      );
    });

    it('should extract path parameters with @ApiParam descriptions', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get(':id')
          @ApiParam({ name: 'id', description: 'User unique identifier' })
          getUser(@Param('id') id: string) {
            return { id };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      expect(info?.parameters[0].name).toBe('id');
      expect(info?.parameters[0].location).toBe('path');
      expect(Option.getOrNull(info!.parameters[0].description)).toBe(
        'User unique identifier',
      );
      expect(info?.parameters[0].required).toBe(true);
    });

    it('should handle parameters without descriptions', () => {
      const code = `
        @Controller('/search')
        class SearchController {
          @Get()
          search(@Query('q') query: string) {
            return { query };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      expect(info?.parameters[0].name).toBe('q');
      expect(info?.parameters[0].location).toBe('query');
      expect(Option.isNone(info!.parameters[0].description)).toBe(true);
      expect(info?.parameters[0].required).toBe(true);
    });
  });

  describe('Controller tags extraction', () => {
    it('should fallback to controller name (PascalCase) when no @ApiTags', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      // Should use PascalCase controller name minus 'Controller' suffix
      expect(info?.controllerTags).toEqual(['Users']);
    });
  });

  describe('@ApiResponse extraction', () => {
    it('should extract multiple @ApiResponse decorators', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get(':id')
          @ApiResponse({ status: 200, description: 'User found', type: UserDto })
          @ApiResponse({ status: 404, description: 'User not found' })
          getUser(@Param('id') id: string) {
            return { id };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.responses).toHaveLength(2);

      const response200 = info?.responses.find((r) => r.statusCode === 200);
      expect(response200).toBeDefined();
      expect(Option.getOrNull(response200!.description)).toBe('User found');
      expect(Option.getOrNull(response200!.type)).toBe('UserDto');
      expect(response200?.isArray).toBe(false);

      const response404 = info?.responses.find((r) => r.statusCode === 404);
      expect(response404).toBeDefined();
      expect(Option.getOrNull(response404!.description)).toBe('User not found');
      expect(Option.isNone(response404!.type)).toBe(true);
    });

    it('should extract array response types', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          @ApiResponse({ status: 200, description: 'List of users', type: [UserDto] })
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.responses).toHaveLength(1);
      expect(info?.responses[0].statusCode).toBe(200);
      expect(Option.getOrNull(info!.responses[0].type)).toBe('UserDto');
      expect(info?.responses[0].isArray).toBe(true);
    });

    it('should return empty array when no @ApiResponse decorators', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.responses).toEqual([]);
    });

    it('should extract @ApiResponse with HttpStatus enum', () => {
      const code = `
        @Controller('/policies')
        class PolicyController {
          @Post()
          @ApiResponse({ status: HttpStatus.CONFLICT, type: ConflictError })
          createPolicy() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.responses).toHaveLength(1);
      expect(info?.responses[0].statusCode).toBe(409);
      expect(Option.getOrNull(info!.responses[0].type)).toBe('ConflictError');
    });

    it('should extract @ApiResponse with HttpStatus.NOT_FOUND', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get(':id')
          @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
          getUser(@Param('id') id: string) {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.responses).toHaveLength(1);
      expect(info?.responses[0].statusCode).toBe(404);
      expect(Option.getOrNull(info!.responses[0].description)).toBe(
        'User not found',
      );
    });
  });

  describe('@HttpCode extraction', () => {
    it('should extract numeric @HttpCode', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Post()
          @HttpCode(201)
          createUser() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(Option.isSome(info!.httpCode)).toBe(true);
      expect(Option.getOrNull(info!.httpCode)).toBe(201);
    });

    it('should extract @HttpCode with HttpStatus enum', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Delete(':id')
          @HttpCode(HttpStatus.NO_CONTENT)
          deleteUser(@Param('id') id: string) {
            return;
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(Option.isSome(info!.httpCode)).toBe(true);
      expect(Option.getOrNull(info!.httpCode)).toBe(204);
    });

    it('should extract @HttpCode with HttpStatus.CREATED', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Post()
          @HttpCode(HttpStatus.CREATED)
          createUser() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(Option.isSome(info!.httpCode)).toBe(true);
      expect(Option.getOrNull(info!.httpCode)).toBe(201);
    });

    it('should return None when no @HttpCode decorator', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(Option.isNone(info!.httpCode)).toBe(true);
    });
  });

  describe('@ApiConsumes extraction', () => {
    it('should extract single content type from @ApiConsumes', () => {
      const code = `
        @Controller('/files')
        class FilesController {
          @Post('upload')
          @ApiConsumes('multipart/form-data')
          uploadFile() {
            return { success: true };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.consumes).toEqual(['multipart/form-data']);
    });

    it('should extract multiple content types from @ApiConsumes', () => {
      const code = `
        @Controller('/data')
        class DataController {
          @Post()
          @ApiConsumes('application/json', 'application/xml')
          createData() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.consumes).toEqual(['application/json', 'application/xml']);
    });

    it('should return empty array when no @ApiConsumes decorator', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Post()
          createUser() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.consumes).toEqual([]);
    });
  });

  describe('@ApiProduces extraction', () => {
    it('should extract single content type from @ApiProduces', () => {
      const code = `
        @Controller('/reports')
        class ReportsController {
          @Get('pdf')
          @ApiProduces('application/pdf')
          getPdfReport() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.produces).toEqual(['application/pdf']);
    });

    it('should extract multiple content types from @ApiProduces', () => {
      const code = `
        @Controller('/export')
        class ExportController {
          @Get()
          @ApiProduces('application/json', 'text/csv', 'application/xml')
          exportData() {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.produces).toEqual([
        'application/json',
        'text/csv',
        'application/xml',
      ]);
    });

    it('should return empty array when no @ApiProduces decorator', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.produces).toEqual([]);
    });
  });

  describe('Multipart form data with multiple files', () => {
    it('should extract @ApiConsumes with multipart/form-data', () => {
      const code = `
        @Controller('/upload')
        class UploadController {
          @Post('multiple')
          @ApiConsumes('multipart/form-data')
          uploadMultiple(@Body() dto: MultiFileUploadDto) {
            return { success: true };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.consumes).toEqual(['multipart/form-data']);
      expect(info?.parameters).toHaveLength(1);
      expect(info?.parameters[0].location).toBe('body');
      expect(info?.parameters[0].tsType).toBe('MultiFileUploadDto');
    });

    it('should extract multiple content types from @ApiConsumes for file upload', () => {
      const code = `
        @Controller('/upload')
        class UploadController {
          @Post('flexible')
          @ApiConsumes('multipart/form-data', 'application/octet-stream')
          uploadFlexible(@Body() file: Buffer) {
            return { success: true };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.consumes).toEqual([
        'multipart/form-data',
        'application/octet-stream',
      ]);
    });
  });
});
