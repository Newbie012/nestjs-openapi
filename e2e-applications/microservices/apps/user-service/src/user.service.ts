import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto, UpdateUserDto, UserDto, UserProfileDto } from './dto';

@Injectable()
export class UserService {
  private users: UserDto[] = [
    {
      id: 'usr_001',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      role: 'user',
      isActive: true,
      createdAt: new Date('2025-09-18T09:00:00Z'),
      updatedAt: new Date('2025-09-18T09:00:00Z'),
    },
    {
      id: 'usr_002',
      email: 'jane.admin@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      role: 'admin',
      isActive: true,
      createdAt: new Date('2025-09-17T14:30:00Z'),
      updatedAt: new Date('2025-09-18T08:15:00Z'),
    },
    {
      id: 'usr_003',
      email: 'bob.moderator@example.com',
      firstName: 'Bob',
      lastName: 'Wilson',
      fullName: 'Bob Wilson',
      role: 'moderator',
      isActive: false,
      createdAt: new Date('2025-09-16T11:20:00Z'),
      updatedAt: new Date('2025-09-18T07:45:00Z'),
    },
  ];

  findAll(params: { role?: string; isActive?: boolean } = {}): UserDto[] {
    let filteredUsers = [...this.users];

    if (params.role) {
      filteredUsers = filteredUsers.filter(user => user.role === params.role);
    }

    if (params.isActive !== undefined) {
      filteredUsers = filteredUsers.filter(user => user.isActive === params.isActive);
    }

    return filteredUsers;
  }

  findById(id: string): UserDto {
    const user = this.users.find(user => user.id === id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  findProfile(id: string): UserProfileDto {
    const user = this.findById(id);
    
    return {
      user,
      preferences: {
        theme: user.role === 'admin' ? 'light' : 'dark',
        notifications: user.isActive,
        language: 'en'
      },
      lastLogin: new Date('2025-09-18T13:45:00Z'),
    };
  }

  create(createUserDto: CreateUserDto): UserDto {
    const newUser: UserDto = {
      id: `usr_${Math.random().toString(36).substr(2, 9)}`,
      email: createUserDto.email,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      fullName: `${createUserDto.firstName} ${createUserDto.lastName}`,
      role: createUserDto.role || 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.users.push(newUser);
    return newUser;
  }

  update(id: string, updateUserDto: UpdateUserDto): UserDto {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updatedUser = {
      ...this.users[userIndex],
      ...updateUserDto,
      fullName: updateUserDto.firstName || updateUserDto.lastName 
        ? `${updateUserDto.firstName || this.users[userIndex].firstName} ${updateUserDto.lastName || this.users[userIndex].lastName}`
        : this.users[userIndex].fullName,
      updatedAt: new Date(),
    };

    this.users[userIndex] = updatedUser;
    return updatedUser;
  }

  delete(id: string): void {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    this.users.splice(userIndex, 1);
  }
}