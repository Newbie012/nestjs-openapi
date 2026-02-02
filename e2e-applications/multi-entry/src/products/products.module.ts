import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';

@Module({
  controllers: [ProductsController],
})
export class ProductsModule {}
