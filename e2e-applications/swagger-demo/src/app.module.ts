import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
// Note: In a real app, you would import from 'nestjs-openapi'
// import { OpenApiModule } from 'nestjs-openapi';
import { OpenApiModule } from '../../../src/module';

/**
 * Demo application module showcasing Swagger UI integration.
 *
 * This demonstrates:
 * - Serving the pre-generated OpenAPI spec at /openapi.json
 * - Serving Swagger UI at /docs using the new `swagger` option
 * - Different configuration patterns (boolean vs object)
 */
@Module({
  imports: [
    OpenApiModule.forRoot({
      // Path to the pre-generated OpenAPI spec (relative to cwd)
      specFile: 'e2e-applications/swagger-demo/openapi.generated.json',

      // Customize the JSON endpoint path
      jsonPath: '/openapi.json',

      // Enable Swagger UI with custom configuration
      swagger: {
        path: '/docs',
        title: 'Users API Documentation',
      },
    }),
  ],
  controllers: [UserController],
  providers: [],
})
export class AppModule {}
