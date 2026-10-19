import { Controller, Get, Module, Post } from '@nestjs/common';
import { RateLimit, Role, Roles } from '../common/roles.decorator';

export class OrderDto {
  id: string;
  total: number;
}

@Controller('orders')
export class OrdersController {
  @Get()
  list(): OrderDto[] {
    return [];
  }

  @Post()
  @Roles(Role.Admin, Role.Support)
  @RateLimit({ perMinute: 10 })
  create(): OrderDto {
    return { id: '', total: 0 };
  }
}

@Module({ controllers: [OrdersController] })
export class OrdersModule {}
