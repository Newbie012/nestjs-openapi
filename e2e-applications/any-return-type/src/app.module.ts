import { Module } from '@nestjs/common';
import { AnyController } from './any.controller.js';

@Module({
  controllers: [AnyController],
})
export class AppModule {}
