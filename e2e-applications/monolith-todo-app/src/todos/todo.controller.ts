import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TodoService } from './todo.service';
import { CreateTodoDto, UpdateTodoDto, TodoDto } from './dto';

@ApiTags('todos')
@Controller('todos')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get()
  @ApiOperation({ summary: 'Get all todos' })
  @ApiQuery({
    name: 'completed',
    required: false,
    description: 'Filter todos by completion status',
    type: 'boolean',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    description: 'Filter todos by priority',
    enum: ['low', 'medium', 'high'],
  })
  @ApiResponse({
    status: 200,
    description: 'List of todos',
    type: [TodoDto],
  })
  findAll(
    @Query('completed') completed?: boolean,
    @Query('priority') priority?: 'low' | 'medium' | 'high',
  ): TodoDto[] {
    let todos = this.todoService.findAll();

    if (completed !== undefined) {
      todos = todos.filter((todo) => todo.completed === completed);
    }

    if (priority) {
      todos = todos.filter((todo) => todo.priority === priority);
    }

    return todos;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a todo by ID' })
  @ApiParam({
    name: 'id',
    description: 'Todo ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'The todo',
    type: TodoDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Todo not found',
  })
  findOne(@Param('id') id: string): TodoDto {
    return this.todoService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new todo' })
  @ApiBody({
    description: 'Todo data',
    type: CreateTodoDto,
  })
  @ApiResponse({
    status: 201,
    description: 'The created todo',
    type: TodoDto,
  })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTodoDto: CreateTodoDto): TodoDto {
    return this.todoService.create(createTodoDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a todo' })
  @ApiParam({
    name: 'id',
    description: 'Todo ID',
    type: 'string',
  })
  @ApiBody({
    description: 'Updated todo data',
    type: UpdateTodoDto,
  })
  @ApiResponse({
    status: 200,
    description: 'The updated todo',
    type: TodoDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Todo not found',
  })
  update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
  ): TodoDto {
    return this.todoService.update(id, updateTodoDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a todo' })
  @ApiParam({
    name: 'id',
    description: 'Todo ID',
    type: 'string',
  })
  @ApiResponse({
    status: 204,
    description: 'Todo deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Todo not found',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.todoService.delete(id);
  }
}
