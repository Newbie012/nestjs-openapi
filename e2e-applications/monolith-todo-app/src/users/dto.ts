import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({
    description: 'Unique user identifier',
    example: 'user-123',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Account creation date',
    example: '2025-09-18T10:00:00Z',
  })
  createdAt: Date;
}

export class DeleteUserConflictDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 409,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Machine-readable error kind',
    enum: ['USER_HAS_TODOS'],
    example: 'USER_HAS_TODOS',
  })
  code: 'USER_HAS_TODOS';

  @ApiProperty({
    description: 'Human-readable explanation',
    example: 'User with ID 1 still has todos and cannot be deleted',
  })
  message: string;
}

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
  })
  name: string;
}
