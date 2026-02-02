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
