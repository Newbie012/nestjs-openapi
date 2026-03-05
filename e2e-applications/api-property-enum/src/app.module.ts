import { Module } from '@nestjs/common';
import { ItemController, TaskController } from './app.controller';

@Module({
  controllers: [ItemController, TaskController],
})
export class AppModule {}
