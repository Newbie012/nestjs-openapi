import { describe, it, expect, beforeEach } from "vitest";
import { Project, MethodDeclaration, ScriptTarget } from "ts-morph";
import {
  NestResolvedHttpMethod,
  ControllerMethodInfo,
} from "./nest-resolved-method.js";

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

  createMethod(code: string): MethodDeclaration {
    const sourceFile = this.project.createSourceFile(
      `test-${Date.now()}.ts`,
      code
    );
    const classDecl = sourceFile.getClasses()[0];
    return classDecl.getMethods()[0];
  }

  createController(params: { name: string; prefix: string }) {
    // Create a minimal ClassDeclaration mock for the declaration property
    const mockDeclaration = {
      getDecorators: () => [],
    } as any;

    return {
      getName: () => params.name,
      getPrefix: () => params.prefix,
      declaration: mockDeclaration,
    };
  }

  getMethodInfo(params: {
    code: string;
    controllerName: string;
    prefix: string;
  }): ControllerMethodInfo {
    const method = this.createMethod(params.code);
    const controller = this.createController({
      name: params.controllerName,
      prefix: params.prefix,
    });
    const ctx = { logger: { info: () => {} } } as any;

    const resolvedMethod = new NestResolvedHttpMethod(ctx, controller, method);
    return resolvedMethod.getInfo();
  }
}

describe("NestResolvedHttpMethod", () => {
  let testSetup: TestSetup;

  beforeEach(() => {
    testSetup = new TestSetup();
  });

  describe("Path parameter transformation", () => {
    it("should preserve :param syntax in paths", () => {
      const code = `
        import { Controller, Get, Param } from '@nestjs/common';

        class UsersController {
          @Get(':id/profile/:section')
          getUserProfile(@Param('id') id: string, @Param('section') section: string) {
            return { id, section };
          }
        }
      `;

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "UsersController",
        prefix: "/api/users",
      });

      expect(info.path).toBe("/api/users/:id/profile/:section");
      expect(info.httpMethod).toBe("GET");
    });

    it("should handle root paths correctly", () => {
      const code = `
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "UsersController",
        prefix: "/users",
      });

      expect(info.path).toBe("/users");
    });
  });

  describe("Parameter extraction with descriptions", () => {
    it("should extract query parameters with @ApiQuery descriptions", () => {
      const code = `
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

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "SearchController",
        prefix: "/search",
      });

      expect(info.parameters).toHaveLength(2);

      const limitParam = info.parameters.find((p) => p.name === "limit");
      expect(limitParam).toMatchObject({
        name: "limit",
        type: "query",
        description: "Maximum number of results",
        required: false,
      });

      const offsetParam = info.parameters.find((p) => p.name === "offset");
      expect(offsetParam).toMatchObject({
        name: "offset",
        type: "query",
        description: "Number of results to skip",
        required: false,
      });
    });

    it("should extract path parameters with @ApiParam descriptions", () => {
      const code = `
        class UsersController {
          @Get(':id')
          @ApiParam({ name: 'id', description: 'User unique identifier' })
          getUser(@Param('id') id: string) {
            return { id };
          }
        }
      `;

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "UsersController",
        prefix: "/users",
      });

      expect(info.parameters).toHaveLength(1);
      expect(info.parameters[0]).toMatchObject({
        name: "id",
        type: "path",
        description: "User unique identifier",
        required: true,
      });
    });

    it("should handle parameters without descriptions", () => {
      const code = `
        class SearchController {
          @Get()
          search(@Query('q') query: string) {
            return { query };
          }
        }
      `;

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "SearchController",
        prefix: "/search",
      });

      expect(info.parameters).toHaveLength(1);
      expect(info.parameters[0]).toMatchObject({
        name: "q",
        type: "query",
        description: undefined,
        required: true,
      });
    });
  });

  describe("Controller tags extraction", () => {
    it("should fallback to controller name when no @ApiTags", () => {
      const code = `
        class UsersController {
          @Get()
          getUsers() {
            return [];
          }
        }
      `;

      const info = testSetup.getMethodInfo({
        code,
        controllerName: "UsersController",
        prefix: "/users",
      });

      expect(info.controllerTags).toEqual(["users"]);
    });
  });
});
