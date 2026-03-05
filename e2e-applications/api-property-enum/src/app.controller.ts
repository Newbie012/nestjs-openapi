import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ItemDto, TaskDto, SearchDto } from './item.dto';

@ApiTags('Items')
@Controller('items')
export class ItemController {
  @Get()
  @ApiOperation({ summary: 'Get all items' })
  @ApiResponse({ status: 200, description: 'List of items', type: [ItemDto] })
  findAll(): ItemDto[] {
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Create an item' })
  @ApiResponse({ status: 201, description: 'Item created', type: ItemDto })
  create(@Body() _dto: ItemDto): ItemDto {
    return {} as ItemDto;
  }
}

@ApiTags('Tasks')
@Controller('tasks')
export class TaskController {
  @Get()
  @ApiOperation({ summary: 'Get all tasks' })
  @ApiResponse({ status: 200, description: 'List of tasks', type: [TaskDto] })
  findAll(): TaskDto[] {
    return [];
  }

  @Post('search')
  @ApiOperation({ summary: 'Search tasks' })
  @ApiResponse({ status: 200, description: 'Search results', type: [TaskDto] })
  search(@Body() _search: SearchDto): TaskDto[] {
    return [];
  }
}
