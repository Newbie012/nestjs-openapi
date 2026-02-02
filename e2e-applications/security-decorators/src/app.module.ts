import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { BearerController } from './bearer.controller';
import { MixedController } from './mixed.controller';
import { OAuthController } from './oauth.controller';
import { MultiSchemeController } from './multi-scheme.controller';

@Module({
  imports: [],
  controllers: [
    PublicController,
    BearerController,
    MixedController,
    OAuthController,
    MultiSchemeController,
  ],
  providers: [],
})
export class AppModule {}
