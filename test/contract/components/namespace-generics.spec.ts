import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('namespace-generic-argument', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#components-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
  },
  source: {
    'src/dtos.ts': `
export class UserDto {
  id: string;
  name: string;
}
`,
    'src/page.dto.ts': `
export class Page<T> {
  items: T[];
  total: number;
}
`,
    'src/users.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import * as Dtos from './dtos.js';
import { Page } from './page.dto.js';

@Controller('users')
export class UsersController {
  @Get()
  list(): Page<Dtos.UserDto> {
    return new Page<Dtos.UserDto>();
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';

@Module({ controllers: [UsersController] })
export class AppModule {}
`,
  },
});
