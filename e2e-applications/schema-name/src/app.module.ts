import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { AuditDto } from './admin/audit.dto';
import { User } from './admin/user';
import { PageDto } from './public/page.dto';
import { UserDto } from './public/user.dto';

@Controller('public/users')
export class PublicUsersController {
  @Get()
  list(): UserDto[] {
    return [];
  }

  @Get('page')
  page(): PageDto<UserDto> {
    return null as never;
  }

  @Get('raw')
  @ApiOkResponse({ schema: { $ref: getSchemaPath(UserDto) } })
  raw(): unknown {
    return null;
  }

  @Post()
  create(@Body() body: UserDto): UserDto {
    return body;
  }
}

@Controller('admin')
export class AdminController {
  @Get('users')
  users(): User[] {
    return [];
  }

  @Get('audits')
  audits(): AuditDto[] {
    return [];
  }
}

@Module({ controllers: [PublicUsersController, AdminController] })
export class AppModule {}
