import { Controller, Get } from '@nestjs/common';

@Controller('test')
export class AnyController {
  @Get('any-return')
  getAnyReturn(): any {
    return { message: 'hello' };
  }

  @Get('promise-any-return')
  getPromiseAnyReturn(): Promise<any> {
    return Promise.resolve({ message: 'hello' });
  }

  @Get('void-return')
  getVoidReturn(): void {
    return undefined;
  }

  @Get('string-return')
  getStringReturn(): string {
    return 'hello';
  }
}
