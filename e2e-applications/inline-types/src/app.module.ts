import { Module } from '@nestjs/common';
import { InlineController } from './inline.controller.js';

@Module({
  controllers: [InlineController],
})
export class AppModule {}
