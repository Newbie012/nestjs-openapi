import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('products')
@ApiTags('products')
export class ProductsController {
  @Get()
  @ApiOperation({ summary: 'Get all products' })
  findAll(): string[] {
    return [];
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  create(@Body() body: { name: string }): string {
    return body.name;
  }
}
