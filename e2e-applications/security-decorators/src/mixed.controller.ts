import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBasicAuth,
  ApiSecurity,
  ApiCookieAuth,
  ApiResponse,
} from '@nestjs/swagger';

export class ArticleDto {
  id: string;
  title: string;
  content: string;
  authorId: string;
}

export class CreateArticleDto {
  title: string;
  content: string;
}

/**
 * Controller demonstrating different security per method.
 * No controller-level security - each method specifies its own.
 */
@ApiTags('Articles')
@Controller('articles')
export class MixedController {
  /** Public endpoint - no security decorator */
  @Get()
  @ApiOperation({ summary: 'List published articles (public)' })
  @ApiResponse({
    status: 200,
    description: 'List of articles',
    type: [ArticleDto],
  })
  findAll(): ArticleDto[] {
    return [];
  }

  /** Bearer auth required */
  @Get(':id')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Get article by ID (requires JWT)' })
  @ApiResponse({ status: 200, description: 'Article found', type: ArticleDto })
  findOne(@Param('id') id: string): ArticleDto {
    return { id, title: 'Article', content: 'Content', authorId: '1' };
  }

  /** Basic auth required */
  @Post()
  @ApiBasicAuth()
  @ApiOperation({ summary: 'Create article (requires basic auth)' })
  @ApiResponse({
    status: 201,
    description: 'Article created',
    type: ArticleDto,
  })
  create(@Body() dto: CreateArticleDto): ArticleDto {
    return { id: '1', title: dto.title, content: dto.content, authorId: '1' };
  }

  /** Generic security scheme */
  @Delete(':id')
  @ApiSecurity('admin-key')
  @ApiOperation({ summary: 'Delete article (requires admin API key)' })
  @ApiResponse({ status: 204, description: 'Article deleted' })
  delete(@Param('id') _id: string): void {
    // deleted
  }

  /** Cookie auth */
  @Get(':id/preview')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Preview article (requires session cookie)' })
  @ApiResponse({
    status: 200,
    description: 'Article preview',
    type: ArticleDto,
  })
  preview(@Param('id') id: string): ArticleDto {
    return { id, title: 'Preview', content: 'Preview content', authorId: '1' };
  }
}
