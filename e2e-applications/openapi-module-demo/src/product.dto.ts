/**
 * Product DTO for the demo API
 * Using interfaces to prove static analysis works without runtime metadata
 */
export interface ProductDto {
  id: string;
  name: string;
  price: number;
  description?: string;
  category: ProductCategory;
  tags: string[];
}

/**
 * DTO for creating a new product
 */
export interface CreateProductDto {
  name: string;
  price: number;
  description?: string;
  category: ProductCategory;
  tags?: string[];
}

/**
 * Product category enum
 */
export type ProductCategory = 'electronics' | 'clothing' | 'food' | 'other';

// =============================================================================
// Union Types - Demonstrating array of union type support
// =============================================================================

/**
 * Event when a product is created
 */
export interface ProductCreatedEvent {
  type: 'product.created';
  productId: string;
  name: string;
  price: number;
  timestamp: string;
}

/**
 * Event when a product is updated
 */
export interface ProductUpdatedEvent {
  type: 'product.updated';
  productId: string;
  changes: {
    name?: string;
    price?: number;
    category?: ProductCategory;
  };
  timestamp: string;
}

/**
 * Event when a product is deleted
 */
export interface ProductDeletedEvent {
  type: 'product.deleted';
  productId: string;
  timestamp: string;
}

/**
 * Union type of all product events
 * This demonstrates that the library can handle discriminated unions
 */
export type ProductEvent =
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductDeletedEvent;
