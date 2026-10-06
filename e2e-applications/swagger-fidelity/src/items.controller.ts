import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiDefaultResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  CreateItemDto,
  ErrorDto,
  ItemDto,
  LibraryUsageDto,
  ReportDto,
  SearchDto,
} from './items.dto';
import {
  ApiStandardErrors,
  ExternalController,
  Internal,
} from './custom-decorators';
import { LibHidden, LibPaged } from './lib/compiled-lib';
import { ExternalLibraryDto } from './external-library-dto';

@ApiTags('Items')
@ApiUnauthorizedResponse({ description: 'Missing credentials' })
@ApiForbiddenResponse({ description: 'Forbidden' })
@Controller('items')
export class ItemsController {
  @Get('report')
  @ApiOkResponse({ type: ReportDto, description: 'The report' })
  @ApiNotFoundResponse({ description: 'No such item' })
  getReport(): string {
    return '';
  }

  @Post()
  @ApiCreatedResponse({ type: [ItemDto] })
  @ApiConflictResponse({ type: ErrorDto, description: 'Already exists' })
  @ApiUnauthorizedResponse({ description: 'Token expired' })
  @ApiBody({ type: CreateItemDto, description: 'What to create' })
  create(@Body() body: unknown): ItemDto[] {
    return [body as ItemDto];
  }

  @Post('search')
  @ApiResponse({ status: HttpStatus.OK, type: ItemDto, isArray: true })
  @ApiDefaultResponse({ type: ErrorDto, description: 'Unexpected error' })
  search(@Body() body: SearchDto): ItemDto[] {
    return [body as unknown as ItemDto];
  }

  @Post('purge')
  @ApiNoContentResponse({ description: 'Purged' })
  purge(): void {}

  @Get('schema')
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(ItemDto) } },
  })
  bySchema(): unknown {
    return [];
  }

  @Get('paged')
  @LibPaged(ReportDto)
  paged(): unknown {
    return [];
  }

  @Get('library')
  library(): ExternalLibraryDto {
    return { name: '', version: '' };
  }

  @Get('library-usage')
  libraryUsage(): LibraryUsageDto {
    return { ref: { source: '' }, previous: null, history: [] };
  }

  @Get('internal')
  @Internal
  internal(): string {
    return '';
  }

  @Get('lib-hidden')
  @LibHidden()
  libHidden(): string {
    return '';
  }
}

@ExternalController('external')
export class ExternalItemsController {
  @Get()
  @ApiStandardErrors()
  list(): ItemDto[] {
    return [];
  }
}
