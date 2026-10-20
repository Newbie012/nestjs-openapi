import { Controller, Delete, Get, Module, Param } from '@nestjs/common';

export class BookDto {
  id: string;
  title: string;
}

@Controller('books')
export class BooksController {
  @Get()
  list(): BookDto[] {
    return [];
  }

  @Get(':id')
  get(@Param('id') id: string): BookDto {
    return { id, title: '' };
  }

  @Delete(':id')
  remove(@Param('id') _id: string): void {}
}

@Controller('internal')
export class InternalController {
  @Get('health')
  health(): string {
    return 'ok';
  }
}

@Module({ controllers: [BooksController, InternalController] })
export class AppModule {}
