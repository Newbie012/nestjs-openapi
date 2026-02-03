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

  describe('Built-in generic types handling', () => {
    it('should NOT return just "Array" for Array<string> (would create broken ref)', () => {
      const code = `
        @Controller('/items')
        class ItemsController {
          @Post('batch')
          createBatch(@Body() ids: Array<string>) {
            return { ids };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      // TypeScript may normalize Array<string> to string[], either is acceptable
      // What's NOT acceptable is just "Array" (which would create a broken $ref)
      expect(info?.parameters[0].tsType).not.toBe('Array');
      expect(['Array<string>', 'string[]']).toContain(
        info?.parameters[0].tsType,
      );
    });

    it('should preserve string[] array syntax', () => {
      const code = `
        @Controller('/items')
        class ItemsController {
          @Post('batch')
          createBatch(@Body() ids: string[]) {
            return { ids };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      expect(info?.parameters[0].tsType).toBe('string[]');
    });

    it('should NOT return just "Array" for Array<UserDto> (would create broken ref)', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Post('batch')
          createBatch(@Body() users: Array<UserDto>) {
            return { users };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      // TypeScript may normalize Array<UserDto> to UserDto[], either is acceptable
      // What's NOT acceptable is just "Array" (which would create a broken $ref)
      expect(info?.parameters[0].tsType).not.toBe('Array');
      expect(['Array<UserDto>', 'UserDto[]']).toContain(
        info?.parameters[0].tsType,
      );
    });

    it('should NOT return just "Record" for Record<string, number> (would create broken ref)', () => {
      const code = `
        @Controller('/stats')
        class StatsController {
          @Post()
          updateStats(@Body() data: Record<string, number>) {
            return data;
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      // Should NOT be just "Record" (which would create a broken $ref)
      expect(info?.parameters[0].tsType).not.toBe('Record');
      expect(info?.parameters[0].tsType).toContain('Record');
    });

    it('should NOT return just "Partial" for Partial<UserDto> (would create broken ref)', () => {
      const code = `
        @Controller('/users')
        class UsersController {
          @Patch(':id')
          updateUser(@Param('id') id: string, @Body() data: Partial<UserDto>) {
            return data;
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      const bodyParam = info?.parameters.find((p) => p.location === 'body');
      // Should NOT be just "Partial" (which would create a broken $ref)
      expect(bodyParam?.tsType).not.toBe('Partial');
    });

    it('should NOT return just "Map" for Map<string, UserDto> (would create broken ref)', () => {
      const code = `
        @Controller('/cache')
        class CacheController {
          @Post()
          setCache(@Body() data: Map<string, UserDto>) {
            return {};
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      // Should NOT be just "Map" (which would create a broken $ref)
      expect(info?.parameters[0].tsType).not.toBe('Map');
    });
  });

  describe('Import alias resolution', () => {
    it('should use original type name for aliased imports', () => {
      // Create a multi-file project to test import aliases
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      // Create the original DTO file
      project.createSourceFile(
        'dto/user.dto.ts',
        `
        export class UserDto {
          id: string;
          name: string;
        }
      `,
      );

      // Create controller that imports with alias
      const controllerFile = project.createSourceFile(
        'controllers/user.controller.ts',
        `
        import { UserDto as UserRequestDto } from '../dto/user.dto';

        @Controller('/users')
        class UsersController {
          @Post()
          createUser(@Body() dto: UserRequestDto) {
            return dto;
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      expect(info.parameters).toHaveLength(1);
      // Should use the ORIGINAL name (UserDto), not the alias (UserRequestDto)
      expect(info.parameters[0].tsType).toBe('UserDto');
    });

    it('should handle non-aliased imports normally', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      // Create the original DTO file
      project.createSourceFile(
        'dto/user.dto.ts',
        `
        export class UserDto {
          id: string;
          name: string;
        }
      `,
      );

      // Create controller with normal import (no alias)
      const controllerFile = project.createSourceFile(
        'controllers/user.controller.ts',
        `
        import { UserDto } from '../dto/user.dto';

        @Controller('/users')
        class UsersController {
          @Post()
          createUser(@Body() dto: UserDto) {
            return dto;
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      expect(info.parameters).toHaveLength(1);
      expect(info.parameters[0].tsType).toBe('UserDto');
    });
  });

  describe('Query DTO inlining', () => {
    it('should expand @Query() DTO properties into individual parameters by default', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      // Create a pagination DTO
      project.createSourceFile(
        'dto/pagination.dto.ts',
        `
        export class PaginationDto {
          page?: number;
          limit?: number;
        }
      `,
      );

      // Create controller using @Query() with DTO
      const controllerFile = project.createSourceFile(
        'controllers/items.controller.ts',
        `
        import { PaginationDto } from '../dto/pagination.dto';

        @Controller('/items')
        class ItemsController {
          @Get()
          findAll(@Query() pagination: PaginationDto) {
            return [];
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      // Should have expanded to 2 individual query parameters
      expect(info.parameters).toHaveLength(2);

      const pageParam = info.parameters.find((p) => p.name === 'page');
      const limitParam = info.parameters.find((p) => p.name === 'limit');

      expect(pageParam).toBeDefined();
      expect(pageParam?.location).toBe('query');
      expect(pageParam?.tsType).toBe('number');
      expect(pageParam?.required).toBe(false); // Optional

      expect(limitParam).toBeDefined();
      expect(limitParam?.location).toBe('query');
      expect(limitParam?.tsType).toBe('number');
      expect(limitParam?.required).toBe(false); // Optional
    });

    it('should NOT expand @Query("name") with explicit parameter name', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      project.createSourceFile(
        'dto/pagination.dto.ts',
        `
        export class PaginationDto {
          page?: number;
          limit?: number;
        }
      `,
      );

      const controllerFile = project.createSourceFile(
        'controllers/items.controller.ts',
        `
        import { PaginationDto } from '../dto/pagination.dto';

        @Controller('/items')
        class ItemsController {
          @Get()
          findAll(@Query('filter') filter: PaginationDto) {
            return [];
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      // Should keep as single parameter (explicit name)
      expect(info.parameters).toHaveLength(1);
      expect(info.parameters[0].name).toBe('filter');
      expect(info.parameters[0].tsType).toBe('PaginationDto');
    });

    it('should keep @Query() as schema ref when query.style is "ref"', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      project.createSourceFile(
        'dto/pagination.dto.ts',
        `
        export class PaginationDto {
          page?: number;
          limit?: number;
        }
      `,
      );

      const controllerFile = project.createSourceFile(
        'controllers/items.controller.ts',
        `
        import { PaginationDto } from '../dto/pagination.dto';

        @Controller('/items')
        class ItemsController {
          @Get()
          findAll(@Query() pagination: PaginationDto) {
            return [];
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method, {
        query: { style: 'ref' },
      });

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      // Should keep as single parameter with DTO type (schema ref behavior)
      expect(info.parameters).toHaveLength(1);
      expect(info.parameters[0].name).toBe('pagination');
      expect(info.parameters[0].tsType).toBe('PaginationDto');
      expect(info.parameters[0].location).toBe('query');
    });

    it('should NOT expand primitive types', () => {
      const code = `
        @Controller('/search')
        class SearchController {
          @Get()
          search(@Query() query: string) {
            return { query };
          }
        }
      `;

      const info = testSetup.getMethodInfo(code);

      expect(info?.parameters).toHaveLength(1);
      expect(info?.parameters[0].name).toBe('query');
      expect(info?.parameters[0].tsType).toBe('string');
    });

    it('should handle DTO with required and optional properties', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      project.createSourceFile(
        'dto/filter.dto.ts',
        `
        export class FilterDto {
          search: string;
          sortBy?: string;
          order?: 'asc' | 'desc';
        }
      `,
      );

      const controllerFile = project.createSourceFile(
        'controllers/items.controller.ts',
        `
        import { FilterDto } from '../dto/filter.dto';

        @Controller('/items')
        class ItemsController {
          @Get()
          findAll(@Query() filter: FilterDto) {
            return [];
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      expect(info.parameters).toHaveLength(3);

      const searchParam = info.parameters.find((p) => p.name === 'search');
      expect(searchParam?.required).toBe(true);
      expect(searchParam?.tsType).toBe('string');

      const sortByParam = info.parameters.find((p) => p.name === 'sortBy');
      expect(sortByParam?.required).toBe(false);
      expect(sortByParam?.tsType).toBe('string');

      const orderParam = info.parameters.find((p) => p.name === 'order');
      expect(orderParam?.required).toBe(false);
    });

    it('should handle mixed @Query() DTO and @Query("name") params', () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: ScriptTarget.Latest,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      });

      project.createSourceFile(
        'dto/pagination.dto.ts',
        `
        export class PaginationDto {
          page?: number;
          limit?: number;
        }
      `,
      );

      const controllerFile = project.createSourceFile(
        'controllers/items.controller.ts',
        `
        import { PaginationDto } from '../dto/pagination.dto';

        @Controller('/items')
        class ItemsController {
          @Get()
          findAll(
            @Query() pagination: PaginationDto,
            @Query('search') search?: string
          ) {
            return [];
          }
        }
      `,
      );

      const controller = controllerFile.getClasses()[0];
      const method = controller.getMethods()[0];
      const result = getMethodInfo(controller, method);

      expect(Option.isSome(result)).toBe(true);
      const info = Option.getOrThrow(result);

      // Should have 3 params: page, limit (from DTO), and search (explicit)
      expect(info.parameters).toHaveLength(3);

      expect(info.parameters.some((p) => p.name === 'page')).toBe(true);
      expect(info.parameters.some((p) => p.name === 'limit')).toBe(true);
      expect(info.parameters.some((p) => p.name === 'search')).toBe(true);
    });
  });
});
