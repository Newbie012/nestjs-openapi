import { Module } from '@nestjs/common';
import { GatewayController, ProxyController } from './gateway.controller';

@Module({
  imports: [],
  controllers: [GatewayController, ProxyController],
  providers: [],
})
export class AppModule {}
