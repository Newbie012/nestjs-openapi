import { Module } from '@nestjs/common';
import {
  ItemsController,
  AdminController,
  InternalPortController,
  LegacyController,
  PublicApiController,
} from './mixed.controller';

@Module({
  imports: [],
  controllers: [
    ItemsController,
    AdminController,
    InternalPortController,
    LegacyController,
    PublicApiController,
  ],
  providers: [],
})
export class AppModule {}
