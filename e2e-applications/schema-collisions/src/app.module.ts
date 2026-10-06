import { Controller, Get, Module } from '@nestjs/common';
import { ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { PageDto } from './page.dto';
import { AddressPatchDto, ShipmentDto } from './shipping/shipping.dto';
import { OrderSummaryDto } from './orders/dto/get-order-summary.dto';
import { ProductDto } from './catalog/dto/product.dto';
import { PluginStateDto as PluginStateA } from './plugins/a/plugin-state.dto';
import { PluginStateDto as PluginStateB } from './plugins/b/plugin-state.dto';

@Controller()
export class AppController {
  @Get('shipments')
  shipments(): ShipmentDto {
    return null as never;
  }

  @Get('orders')
  orders(): OrderSummaryDto {
    return null as never;
  }

  @Get('products')
  products(): ProductDto[] {
    return [];
  }

  @Get('plugins/a')
  pluginA(): PluginStateA {
    return null as never;
  }

  @Get('shipments/patch')
  patch(): AddressPatchDto {
    return null as never;
  }

  @Get('products/raw')
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(ProductDto) } },
  })
  rawProducts(): unknown {
    return [];
  }

  @Get('plugins/page')
  pluginPage(): PageDto<PluginStateA> {
    return null as never;
  }

  @Get('plugins/b')
  pluginB(): PluginStateB {
    return null as never;
  }
}

@Module({ controllers: [AppController] })
export class AppModule {}
