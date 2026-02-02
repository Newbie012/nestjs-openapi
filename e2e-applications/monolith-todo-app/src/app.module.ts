import { Module } from '@nestjs/common';
import { TodoModule } from './todos/todo.module';
import { UserModule } from './users/user.module';

@Module({
  imports: [TodoModule, UserModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
