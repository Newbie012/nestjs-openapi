import { Controller, Get } from '@nestjs/common';
import { StateDto } from './state.dto';

@Controller()
export class AppController {
  @Get('state')
  getState(): StateDto {
    return { installed: 0 };
  }
}
