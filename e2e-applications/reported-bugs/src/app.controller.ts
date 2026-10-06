import { Body, Controller, Get, Post } from '@nestjs/common';
import { FooDto } from './a/foo.dto';
import { ArticleDto } from './article/article.dto';
import { BaseCursorResponse } from './util/cursor.dto.util';
import { ExtendedCursorDto, ListRequestDto } from './util/list.dto';

@Controller()
export class AppController {
  @Get('foo')
  getFoo(): FooDto {
    return { a: 'x' };
  }

  @Get('article')
  getArticle(): ArticleDto {
    return { summary: null, details: null, id: '1' };
  }

  @Get('base-cursor')
  getBaseCursor(): BaseCursorResponse {
    return { cursor: '' };
  }

  @Get('extended-cursor')
  getExtendedCursor(): ExtendedCursorDto {
    return { cursor: '', extra: '', sortBy: { field: 'id', direction: 'asc' } };
  }

  @Post('list')
  list(@Body() body: ListRequestDto): string {
    return String(body);
  }
}
