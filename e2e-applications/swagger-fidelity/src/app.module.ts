import { Module } from '@nestjs/common';
import { ExternalItemsController, ItemsController } from './items.controller';
import { PeopleController } from './people.controller';
import { ParamsController } from './params.controller';

@Module({
  controllers: [
    ItemsController,
    ExternalItemsController,
    PeopleController,
    ParamsController,
  ],
})
export class AppModule {}
