import { Module } from '@nestjs/common';
import {
  ItemsController,
  AdminController,
  LegacyController,
  PublicApiController,
} from './mixed.controller';

@Module({
  imports: [],
  controllers: [
    ItemsController,
    AdminController,
    LegacyController,
    PublicApiController,
  ],
  providers: [],
})
export class AppModule {}
