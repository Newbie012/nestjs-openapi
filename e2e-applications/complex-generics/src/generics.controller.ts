import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ApiResponse as ApiResponseDto,
  PaginatedResponse,
  UserEntity,
  ArticleEntity,
  CommentEntity,
  CreateArticleDto,
  UpdateArticleDto,
  ArticleWithAuthor,
  ArticleWithComments,
  PaginatedArticlesWithAuthors,
  SearchResult,
  BatchResult,
  UserSettings,
  FilterRules,
} from './dto';

/**
 * Controller demonstrating generic response types
 */
@ApiTags('Articles')
@Controller('articles')
export class ArticleController {
  @Get()
  @ApiOperation({ summary: 'Get paginated articles' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of articles',
    type: PaginatedResponse<ArticleEntity>,
  })
  findAll(
    @Query('page') _page?: number,
    @Query('pageSize') _pageSize?: number,
  ): PaginatedResponse<ArticleEntity> {
    return {} as PaginatedResponse<ArticleEntity>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({
    status: 200,
    description: 'Article found',
    type: ApiResponseDto<ArticleEntity>,
  })
  @ApiResponse({ status: 404, description: 'Article not found' })
  findOne(@Param('id') _id: string): ApiResponseDto<ArticleEntity> {
    return {} as ApiResponseDto<ArticleEntity>;
  }

  @Get(':id/with-author')
  @ApiOperation({ summary: 'Get article with embedded author' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({
    status: 200,
    description: 'Article with author details',
    type: ArticleWithAuthor,
  })
  findWithAuthor(@Param('id') _id: string): ArticleWithAuthor {
    return {} as ArticleWithAuthor;
  }

  @Get(':id/with-comments')
  @ApiOperation({ summary: 'Get article with all comments' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({
    status: 200,
    description: 'Article with comments',
    type: ArticleWithComments,
  })
  findWithComments(@Param('id') _id: string): ArticleWithComments {
    return {} as ArticleWithComments;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new article' })
  @ApiResponse({
    status: 201,
    description: 'Article created',
    type: ApiResponseDto<ArticleEntity>,
  })
  create(@Body() _dto: CreateArticleDto): ApiResponseDto<ArticleEntity> {
    return {} as ApiResponseDto<ArticleEntity>;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an article' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({
    status: 200,
    description: 'Article updated',
    type: ApiResponseDto<ArticleEntity>,
  })
  update(
    @Param('id') _id: string,
    @Body() _dto: UpdateArticleDto,
  ): ApiResponseDto<ArticleEntity> {
    return {} as ApiResponseDto<ArticleEntity>;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an article' })
  @ApiParam({ name: 'id', description: 'Article ID' })
  @ApiResponse({ status: 204, description: 'Article deleted' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  remove(@Param('id') _id: string): void {
    // delete
  }
}

/**
 * Controller demonstrating nested generics and complex responses
 */
@ApiTags('Users')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Get paginated users' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    type: PaginatedResponse<UserEntity>,
  })
  findAll(): PaginatedResponse<UserEntity> {
    return {} as PaginatedResponse<UserEntity>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: ApiResponseDto<UserEntity>,
  })
  findOne(@Param('id') _id: string): ApiResponseDto<UserEntity> {
    return {} as ApiResponseDto<UserEntity>;
  }

  @Get(':id/articles')
  @ApiOperation({ summary: 'Get user articles with author info' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Paginated articles by this user',
    type: PaginatedArticlesWithAuthors,
  })
  getUserArticles(@Param('id') _id: string): PaginatedArticlesWithAuthors {
    return {} as PaginatedArticlesWithAuthors;
  }

  @Get(':id/settings')
  @ApiOperation({ summary: 'Get user settings' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User settings',
    type: UserSettings,
  })
  getSettings(@Param('id') _id: string): UserSettings {
    return {} as UserSettings;
  }

  @Put(':id/settings')
  @ApiOperation({ summary: 'Update user settings' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Settings updated',
    type: ApiResponseDto<UserSettings>,
  })
  updateSettings(
    @Param('id') _id: string,
    @Body() _settings: UserSettings,
  ): ApiResponseDto<UserSettings> {
    return {} as ApiResponseDto<UserSettings>;
  }
}

/**
 * Controller demonstrating search with union types
 */
@ApiTags('Search')
@Controller('search')
export class SearchController {
  @Get()
  @ApiOperation({ summary: 'Global search across all entities' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by entity type',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: [SearchResult],
  })
  search(
    @Query('q') _query: string,
    @Query('type') _type?: string,
  ): SearchResult[] {
    return [];
  }
}

/**
 * Controller demonstrating batch operations with generics
 */
@ApiTags('Batch')
@Controller('batch')
export class BatchController {
  @Post('articles')
  @ApiOperation({ summary: 'Batch create articles' })
  @ApiResponse({
    status: 200,
    description: 'Batch operation result',
    type: BatchResult<ArticleEntity>,
  })
  batchCreateArticles(
    @Body() _articles: CreateArticleDto[],
  ): BatchResult<ArticleEntity> {
    return {} as BatchResult<ArticleEntity>;
  }

  @Delete('articles')
  @ApiOperation({ summary: 'Batch delete articles' })
  @ApiResponse({
    status: 200,
    description: 'Batch deletion result',
    type: BatchResult<string>,
  })
  batchDeleteArticles(@Body() _ids: string[]): BatchResult<string> {
    return {} as BatchResult<string>;
  }
}

/**
 * Controller demonstrating comments with nested entity relationships
 */
@ApiTags('Comments')
@Controller('comments')
export class CommentController {
  @Get()
  @ApiOperation({ summary: 'Get paginated comments' })
  @ApiQuery({
    name: 'articleId',
    required: false,
    description: 'Filter by article',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of comments',
    type: PaginatedResponse<CommentEntity>,
  })
  findAll(
    @Query('articleId') _articleId?: string,
  ): PaginatedResponse<CommentEntity> {
    return {} as PaginatedResponse<CommentEntity>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get comment by ID' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  @ApiResponse({
    status: 200,
    description: 'Comment found',
    type: ApiResponseDto<CommentEntity>,
  })
  findOne(@Param('id') _id: string): ApiResponseDto<CommentEntity> {
    return {} as ApiResponseDto<CommentEntity>;
  }
}

/**
 * Controller demonstrating inline object types that generate structure refs
 * These should be normalized to readable names based on property context
 */
@ApiTags('Filters')
@Controller('filters')
export class FilterController {
  @Get()
  @ApiOperation({ summary: 'Get current filter rules' })
  @ApiResponse({
    status: 200,
    description: 'Current filter configuration',
    type: FilterRules,
  })
  getFilters(): FilterRules {
    return {} as FilterRules;
  }

  @Post()
  @ApiOperation({ summary: 'Update filter rules' })
  @ApiResponse({
    status: 200,
    description: 'Updated filter configuration',
    type: FilterRules,
  })
  updateFilters(@Body() _rules: FilterRules): FilterRules {
    return {} as FilterRules;
  }
}
