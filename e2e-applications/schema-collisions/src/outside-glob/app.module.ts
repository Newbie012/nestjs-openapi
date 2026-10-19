import { Controller, Get, Module } from '@nestjs/common';
import { ItemListDto } from './items/item.dto';
import { ItemDto as RemoteItemDto } from './remote/item.client';

@Controller('items')
export class ItemsController {
  @Get()
  list(): ItemListDto {
    return null as never;
  }
}

@Controller('internal/items')
export class InternalItemsController {
  @Get()
  list(): RemoteItemDto[] {
    return [];
  }
}

@Module({ controllers: [ItemsController, InternalItemsController] })
export class AppModule {}
