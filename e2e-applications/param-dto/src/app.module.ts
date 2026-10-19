import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { ItemFilterDto, ItemRouteParams, OwnerRouteParams } from './owner.dto';

@Controller('owners')
export class OwnersController {
  @Get(':ownerId/items/:itemId')
  @ApiParam({ name: 'itemId', description: 'The item' })
  item(@Param() params: ItemRouteParams): string {
    return params.itemId;
  }

  @Get(':ownerId')
  owner(@Param() params: OwnerRouteParams): string {
    return params.ownerId;
  }

  @Get(':ownerId/items')
  items(
    @Param('ownerId') ownerId: string,
    @Query() filter: ItemFilterDto,
  ): string {
    return `${ownerId}${filter.limit}`;
  }
}

@Module({ controllers: [OwnersController] })
export class AppModule {}
