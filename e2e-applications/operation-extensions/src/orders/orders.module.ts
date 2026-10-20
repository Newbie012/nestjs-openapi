import {
  Controller,
  Get,
  Module,
  Post,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import { RateLimit, Role, Roles } from '../common/roles.decorator';

export class OrderDto {
  id: string;
  total: number;
}

export class OrderOwnerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Controller('orders')
export class OrdersController {
  @Get()
  list(): OrderDto[] {
    return [];
  }

  @Get(':id')
  @UseGuards(OrderOwnerGuard)
  get(): OrderDto {
    return { id: '', total: 0 };
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
