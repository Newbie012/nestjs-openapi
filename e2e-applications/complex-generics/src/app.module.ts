import { Module } from '@nestjs/common';
import {
  ArticleController,
  UserController,
  SearchController,
  BatchController,
  CommentController,
  FilterController,
} from './generics.controller';

@Module({
  imports: [],
  controllers: [
    ArticleController,
    UserController,
    SearchController,
    BatchController,
    CommentController,
    FilterController,
  ],
  providers: [],
})
export class AppModule {}
