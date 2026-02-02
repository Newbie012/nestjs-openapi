import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Comparison Benchmark API')
    .setDescription('API for testing @nestjs/swagger CLI plugin output')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Write the generated spec to a file
  const outputPath = path.join(__dirname, '..', 'swagger-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI spec generated at: ${outputPath}`);

  await app.close();
}

bootstrap();
