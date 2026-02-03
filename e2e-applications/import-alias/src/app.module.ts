import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { BuiltinTypesController } from './builtin-types.controller';

@Module({
  controllers: [UserController, BuiltinTypesController],
})
export class AppModule {}
