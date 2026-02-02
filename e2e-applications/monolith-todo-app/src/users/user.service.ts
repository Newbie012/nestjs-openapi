import { Injectable, NotFoundException } from '@nestjs/common';
import { UserDto, CreateUserDto } from './dto';

@Injectable()
export class UserService {
  private users: UserDto[] = [
    {
      id: '1',
      email: 'john@example.com',
      name: 'John Doe',
      createdAt: new Date('2025-09-18T09:00:00Z'),
    },
    {
      id: '2',
      email: 'jane@example.com',
      name: 'Jane Smith',
      createdAt: new Date('2025-09-18T09:30:00Z'),
    },
  ];

  findAll(): UserDto[] {
    return this.users;
  }

  findById(id: string): UserDto {
    const user = this.users.find((user) => user.id === id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  create(createUserDto: CreateUserDto): UserDto {
    const newUser: UserDto = {
      id: Math.random().toString(36).substr(2, 9),
      ...createUserDto,
      createdAt: new Date(),
    };

    this.users.push(newUser);
    return newUser;
  }
}
