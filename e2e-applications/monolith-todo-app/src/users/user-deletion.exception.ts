import { ConflictException } from '@nestjs/common';

export class UserHasTodosError extends ConflictException {
  constructor(id: string) {
    super(`User with ID ${id} still has todos and cannot be deleted`);
  }
}
