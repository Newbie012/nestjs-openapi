/**
 * User DTO for the demo API
 */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

/**
 * DTO for creating a new user
 */
export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

/**
 * DTO for updating a user
 */
export interface UpdateUserDto {
  email?: string;
  name?: string;
  role?: UserRole;
}

/**
 * User role enum
 */
export type UserRole = 'admin' | 'user' | 'guest';
