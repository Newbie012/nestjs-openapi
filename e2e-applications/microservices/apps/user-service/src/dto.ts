import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: ['admin', 'user', 'moderator'],
    default: 'user',
  })
  role: 'admin' | 'user' | 'moderator';
}

export class UpdateUserDto {
  @ApiProperty({
    description: 'User first name',
    required: false,
  })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    required: false,
  })
  lastName?: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: ['admin', 'user', 'moderator'],
    required: false,
  })
  role?: 'admin' | 'user' | 'moderator';

  @ApiProperty({
    description: 'Whether the user account is active',
    required: false,
  })
  isActive?: boolean;
}

export class UserDto {
  @ApiProperty({
    description: 'Unique user identifier',
    example: 'usr_123456789',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'Full display name',
    example: 'John Doe',
  })
  fullName: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: ['admin', 'user', 'moderator'],
    example: 'user',
  })
  role: 'admin' | 'user' | 'moderator';

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2025-09-18T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last account update timestamp',
    example: '2025-09-18T10:00:00Z',
  })
  updatedAt: Date;
}

export class UserProfileDto {
  @ApiProperty({
    description: 'User information',
    type: UserDto,
  })
  user: UserDto;

  @ApiProperty({
    description: 'User preferences',
    example: { theme: 'dark', notifications: true },
  })
  preferences: Record<string, any>;

  @ApiProperty({
    description: 'Last login timestamp',
    example: '2025-09-18T14:30:00Z',
  })
  lastLogin: Date;
}
