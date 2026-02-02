import { Module } from '@nestjs/common';
import { UserController, ProductController } from './validation.controller';

@Module({
  imports: [],
  controllers: [UserController, ProductController],
  providers: [],
})
export class AppModule {}
