import { Controller, Get, Module } from '@nestjs/common';
import { ProductReviewDto } from './catalog/dto/product-review.dto';
import { ReviewerDto } from './libs/external-review.dto';
@Controller()
export class AppController {
  @Get('review') review(): ProductReviewDto {
    return null as never;
  }
  @Get('external') external(): ReviewerDto {
    return null as never;
  }
}
@Module({ controllers: [AppController] })
export class AppModule {}
