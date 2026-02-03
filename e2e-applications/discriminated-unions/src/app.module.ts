import { Module } from '@nestjs/common';
import { UnionsController } from './unions.controller';

@Module({
  imports: [],
  controllers: [UnionsController],
  providers: [],
})
export class AppModule {}
