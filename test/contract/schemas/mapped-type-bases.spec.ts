import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * A class built from mapped-type helpers (`PartialType(OmitType(UserDto,
 * ['id']))`) has the properties of the classes the helpers name, though the
 * operations never mention those classes
 */
contract('mapped-type-bases', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    openapi: { info: { title: 'Mapped Type Bases API', version: '1.0.0' } },
  },
  source: {
    'src/user.dto.ts': `
export class UserDto {
  id: string;
  name: string;
  email: string;
}
`,
    'src/update-user.dto.ts': `
import { OmitType, PartialType } from '@nestjs/swagger';
import { UserDto } from './user.dto.js';

export class UpdateUserDto extends PartialType(OmitType(UserDto, ['id'] as const)) {}
`,
    'src/users.controller.ts': `
import { Body, Controller, Patch } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto.js';

@Controller('users')
export class UsersController {
  @Patch()
  update(@Body() body: UpdateUserDto): void {}
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
