import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import type { ProductDto, CreateProductDto, ProductEvent } from './product.dto';

@ApiTags('products')
@Controller('products')
export class ProductController {
  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200, description: 'List of products' })
  findAll(): ProductDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({ status: 200, description: 'The product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string): ProductDto {
    return {
      id,
      name: 'Sample',
      price: 0,
      category: 'other',
      tags: [],
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  create(@Body() createProductDto: CreateProductDto): ProductDto {
    return {
      id: '1',
      ...createProductDto,
      tags: createProductDto.tags ?? [],
    };
  }

  /**
   * Returns an array of product events (union type)
   * This demonstrates that the library can handle:
   * - Arrays of union types
   * - Discriminated unions (type field)
   */
  @Get(':id/events')
  @ApiOperation({ summary: 'Get product event history' })
  @ApiResponse({ status: 200, description: 'List of product events' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getEvents(
    @Param('id') id: string,
    @Query('limit') _limit?: number,
  ): ProductEvent[] {
    // Mock data showing different event types
    return [
      {
        type: 'product.created',
        productId: id,
        name: 'Sample Product',
        price: 99.99,
        timestamp: new Date().toISOString(),
      },
      {
        type: 'product.updated',
        productId: id,
        changes: { price: 89.99 },
        timestamp: new Date().toISOString(),
      },
    ];
  }
}
