import { Controller, Get, Module } from '@nestjs/common';
import { ProductReviewDto } from './catalog/dto/product-review.dto';
@Controller()
export class AppController {
  @Get('review') review(): ProductReviewDto {
    return null as never;
  }
}
@Module({ controllers: [AppController] })
export class AppModule {}
