import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTodoDto, UpdateTodoDto, TodoDto } from './dto';

@Injectable()
export class TodoService {
  private todos: TodoDto[] = [
    {
      id: '1',
      title: 'Learn NestJS',
      description: 'Build a todo API with NestJS',
      completed: false,
      priority: 'high',
      createdAt: new Date('2025-09-18T10:00:00Z'),
      updatedAt: new Date('2025-09-18T10:00:00Z'),
    },
    {
      id: '2',
      title: 'Write tests',
      description: 'Add comprehensive E2E tests',
      completed: false,
      priority: 'medium',
      createdAt: new Date('2025-09-18T10:30:00Z'),
      updatedAt: new Date('2025-09-18T10:30:00Z'),
    },
  ];

  findAll(): TodoDto[] {
    return this.todos;
  }

  findById(id: string): TodoDto {
    const todo = this.todos.find(todo => todo.id === id);
    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }
    return todo;
  }

  create(createTodoDto: CreateTodoDto): TodoDto {
    const newTodo: TodoDto = {
      id: Math.random().toString(36).substr(2, 9),
      ...createTodoDto,
      description: createTodoDto.description || '',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.todos.push(newTodo);
    return newTodo;
  }

  update(id: string, updateTodoDto: UpdateTodoDto): TodoDto {
    const todoIndex = this.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    const updatedTodo = {
      ...this.todos[todoIndex],
      ...updateTodoDto,
      updatedAt: new Date(),
    };

    this.todos[todoIndex] = updatedTodo;
    return updatedTodo;
  }

  delete(id: string): void {
    const todoIndex = this.todos.findIndex(todo => todo.id === id);
    if (todoIndex === -1) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    this.todos.splice(todoIndex, 1);
  }
}