import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#components-object';
const files = { entry: 'src/app.module.ts', dtoGlob: 'src/dtos/*.dto.ts' };
const openapi = { info: { title: 'Outside dtoGlob API', version: '1.0.0' } };

const appModule = `
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';

@Module({ controllers: [UsersController] })
export class AppModule {}
`;

/**
 * Decorator metadata is read from the classes the schema files import, so a
 * class outside `dtoGlob` keeps its `@ApiProperty` details
 */
contract('decorator-metadata-outside-dto-glob', {
  spec,
  config: { files, openapi },
  source: {
    'src/shared/address.ts': `
import { ApiProperty } from '@nestjs/swagger';

export class AddressDto {
  @ApiProperty({ description: 'Street and number', example: '1 Main St' })
  street: string;
}
`,
    'src/dtos/user.dto.ts': `
import { AddressDto } from '../shared/address.js';

export class UserDto {
  address: AddressDto;
}
`,
    'src/users.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { UserDto } from './dtos/user.dto.js';

@Controller('users')
export class UsersController {
  @Get()
  find(): UserDto {
    return new UserDto();
  }
}
`,
    'src/app.module.ts': appModule,
  },
});
