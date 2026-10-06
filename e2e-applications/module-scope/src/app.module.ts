import { Controller, Get, Global, Module } from '@nestjs/common';

@Controller('feature')
export class FeatureController {
  @Get()
  get(): string {
    return '';
  }
}

@Module({ controllers: [FeatureController] })
export class FeatureModule {}

@Controller('shared')
export class SharedController {
  @Get()
  get(): string {
    return '';
  }
}

@Global()
@Module({ controllers: [SharedController] })
export class SharedModule {}

@Controller('external')
export class ExternalController {
  @Get()
  get(): string {
    return '';
  }
}

@Module({
  imports: [FeatureModule, SharedModule],
  controllers: [ExternalController],
})
export class ExternalApiModule {}

@Controller('internal')
export class InternalController {
  @Get()
  get(): string {
    return '';
  }
}

@Module({ controllers: [InternalController] })
export class InternalModule {}

@Module({ imports: [ExternalApiModule, InternalModule] })
export class AppModule {}
