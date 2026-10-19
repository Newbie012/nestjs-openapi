import { Controller, Get, Module, Param } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';
import { Role, Roles } from '../common/roles.decorator';

export class UserDto {
  id: string;
  name: string;
}

@Controller('users')
@Roles(Role.Admin)
@ApiExtension('x-owner', 'accounts')
export class UsersController {
  @Get()
  list(): UserDto[] {
    return [];
  }

  @Get(':id')
  @ApiExtension('x-owner', 'profiles')
  get(@Param('id') id: string): UserDto {
    return { id, name: '' };
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
