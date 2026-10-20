import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * How @nestjs/swagger combines what a controller and its methods declare:
 * tags, content types and responses of the controller join the method's (a
 * response of the same status merges field by field), a method's
 * `@ApiExtension` wins over the controller's, the topmost decorator wins
 * over the ones below it, a method's `@ApiQuery` replaces the controller's of
 * the same name, and `@All()` documents every HTTP method
 */
contract('decorator-merging', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#operation-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    openapi: { info: { title: 'Decorator Merging API', version: '1.0.0' } },
  },
  source: {
    'src/thing.dto.ts': `
export class ThingDto {
  id: string;
}
`,
    'src/things.controller.ts': `
import { All, Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiConsumes,
  ApiExtension,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThingDto } from './thing.dto.js';

@ApiTags('Things')
@ApiConsumes('application/json')
@ApiProduces('application/json')
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 200, description: 'From the controller' })
@ApiExtension('x-scope', 'controller')
@ApiExtension('x-only-controller', true)
@ApiQuery({ name: 'q', description: 'From the controller' })
@Controller('things')
export class ThingsController {
  @Get('one')
  @ApiTags('One')
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, type: ThingDto })
  @ApiExtension('x-scope', 'method')
  @ApiExtension('x-order', 'top')
  @ApiExtension('x-order', 'bottom')
  @ApiQuery({ name: 'q', description: 'From the method' })
  one(): ThingDto {
    return new ThingDto();
  }

  @Post('two')
  @ApiConsumes('text/plain')
  two(@Body() body: ThingDto): ThingDto {
    return body;
  }

  @All('any')
  any(): ThingDto {
    return new ThingDto();
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ThingsController } from './things.controller.js';

@Module({ controllers: [ThingsController] })
export class AppModule {}
`,
  },
});
