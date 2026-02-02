import { ApiProperty } from '@nestjs/swagger';

export class CreateTodoDto {
  @ApiProperty({
    description: 'The title of the todo item',
    example: 'Buy groceries',
  })
  title: string;

  @ApiProperty({
    description: 'Detailed description of the todo item',
    example: 'Buy milk, eggs, and bread from the store',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Priority level of the todo',
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  priority: 'low' | 'medium' | 'high';
}

export class UpdateTodoDto {
  @ApiProperty({
    description: 'The title of the todo item',
    required: false,
  })
  title?: string;

  @ApiProperty({
    description: 'Detailed description of the todo item',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Whether the todo is completed',
    required: false,
  })
  completed?: boolean;

  @ApiProperty({
    description: 'Priority level of the todo',
    enum: ['low', 'medium', 'high'],
    required: false,
  })
  priority?: 'low' | 'medium' | 'high';
}

export class TodoDto {
  @ApiProperty({
    description: 'Unique identifier for the todo',
    example: 'uuid-123',
  })
  id: string;

  @ApiProperty({
    description: 'The title of the todo item',
    example: 'Buy groceries',
  })
  title: string;

  @ApiProperty({
    description: 'Detailed description of the todo item',
    example: 'Buy milk, eggs, and bread from the store',
  })
  description: string;

  @ApiProperty({
    description: 'Whether the todo is completed',
    example: false,
  })
  completed: boolean;

  @ApiProperty({
    description: 'Priority level of the todo',
    enum: ['low', 'medium', 'high'],
    example: 'medium',
  })
  priority: 'low' | 'medium' | 'high';

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-09-18T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-09-18T10:00:00Z',
  })
  updatedAt: Date;
}
