import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.1.0#paths-object';

const source = {
  'app.module.ts': `
    import { Module } from '@nestjs/common';
    import { TasksController } from './tasks.controller';
    import { Accounts } from './accounts.controller';

    @Module({ controllers: [TasksController, Accounts] })
    export class AppModule {}
  `,
  'tasks.controller.ts': `
    import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
    import { TaskDto, CreateTaskDto } from './task.dto';

    @Controller('tasks')
    export class TasksController {
      @Get()
      list(): TaskDto[] { return []; }

      @Post()
      create(@Body() body: CreateTaskDto): TaskDto { return {} as TaskDto; }

      @Get(':id')
      get(@Param('id') id: string): TaskDto { return {} as TaskDto; }

      @Delete(':id')
      remove(@Param('id') id: string): void {}
    }
  `,
  'accounts.controller.ts': `
    import { Controller, Get } from '@nestjs/common';
    import { AccountDto } from './task.dto';

    @Controller('accounts')
    export class Accounts {
      @Get()
      list(): AccountDto[] { return []; }
    }
  `,
  'task.dto.ts': `
    export class CreateTaskDto {
      title!: string;
      done?: boolean;
    }

    export class AccountDto {
      zeta!: string;
      alpha!: number;
    }

    export class TaskDto {
      id!: string;
      title!: string;
      done!: boolean;
      owner!: AccountDto;
      createdAt!: string;
    }
  `,
};

const files = {
  entry: 'app.module.ts',
  dtoGlob: '**/*.dto.ts',
};

contract('declaration-order-source', {
  spec,
  source,
  config: { files, options: { order: 'source' } },
});

contract('declaration-order-alphabetical', {
  spec,
  source,
  config: { files, options: { order: 'alphabetical' } },
});
