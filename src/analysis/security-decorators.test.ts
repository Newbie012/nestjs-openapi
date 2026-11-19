import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractSecurity } from './security-decorators.js';

const securityOf = (controllerDecorators: string, methodDecorators = '') => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  const sourceFile = project.createSourceFile(
    '/test.ts',
    `
    ${controllerDecorators}
    @Controller('reports')
    export class ReportsController {
      ${methodDecorators}
      @Get()
      list() {}
    }
  `,
  );
  const controller = sourceFile.getClassOrThrow('ReportsController');
  return extractSecurity(controller, controller.getMethodOrThrow('list'));
};

describe('extractSecurity', () => {
  it.each([
    ['@ApiBearerAuth()', { bearer: [] }],
    ["@ApiBearerAuth('jwt')", { jwt: [] }],
    ['@ApiBasicAuth()', { basic: [] }],
    ['@ApiCookieAuth()', { cookie: [] }],
    [
      "@ApiOAuth2(['read:users', 'write:users'])",
      { oauth2: ['read:users', 'write:users'] },
    ],
    ["@ApiOAuth2(['read'], 'my-oauth')", { 'my-oauth': ['read'] }],
    ["@ApiSecurity('api-key')", { 'api-key': [] }],
    ["@ApiSecurity('api-key', ['read'])", { 'api-key': ['read'] }],
    [
      "@ApiSecurity({ apiKey: [], oauth2: ['read'] })",
      { apiKey: [], oauth2: ['read'] },
    ],
  ])('reads %s', (decorator, requirement) => {
    expect(securityOf(decorator)).toEqual([requirement]);
  });

  it('lists one requirement per decorator, bottom to top as Nest runs them', () => {
    expect(
      securityOf(`@ApiBearerAuth('jwt')\n@ApiSecurity('admin-key')`),
    ).toEqual([{ 'admin-key': [] }, { jwt: [] }]);
  });

  it("lists the controller's requirements before the method's", () => {
    expect(securityOf('@ApiBearerAuth()', `@ApiSecurity('api-key')`)).toEqual([
      { bearer: [] },
      { 'api-key': [] },
    ]);
  });

  it('reads security from the method alone', () => {
    expect(securityOf('', '@ApiBearerAuth()')).toEqual([{ bearer: [] }]);
  });

  it('returns nothing without security decorators', () => {
    expect(securityOf('', "@ApiOperation({ summary: 'List' })")).toEqual([]);
  });
});
