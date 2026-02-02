import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
