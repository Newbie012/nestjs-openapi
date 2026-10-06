import { Controller, Get, Module } from '@nestjs/common';
import { CheckoutDto } from './checkout.dto';

@Controller('checkouts')
export class CheckoutsController {
  @Get()
  list(): CheckoutDto[] {
    return [];
  }
}

@Module({ controllers: [CheckoutsController] })
export class AppModule {}
