import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
// Note: In a real app, you would import from 'nestjs-openapi-static'
// import { OpenApiModule } from 'nestjs-openapi-static';
import { OpenApiModule } from '../../../src/module';

/**
 * Demo application module showing OpenApiModule usage.
 *
 * This demonstrates:
 * - Serving the pre-generated OpenAPI spec at /openapi.json
 * - Serving Swagger UI at /api-docs
 * - Conditional enabling based on environment
 */
@Module({
  imports: [
    OpenApiModule.forRoot({
      // Path to the pre-generated OpenAPI spec (relative to cwd)
      filePath: 'e2e-applications/openapi-module-demo/openapi.generated.json',

      // Enable based on environment (always enabled for demo)
      enabled: process.env.OPENAPI_ENABLED !== 'false',

      // Customize the JSON endpoint path
      jsonPath: '/openapi.json',

      // Enable Swagger UI
      serveSwaggerUi: true,
      swaggerUiPath: '/api-docs',
    }),
  ],
  controllers: [ProductController],
  providers: [],
})
export class AppModule {}
