import { Controller, Get } from '@nestjs/common';
import { HelloDto } from './hello.dto.js';

@Controller('hello')
export class AppController {
  @Get()
  hello(): HelloDto {
    return { message: 'hi' };
  }
}
