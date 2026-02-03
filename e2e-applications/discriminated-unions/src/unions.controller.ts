import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type {
  PaymentMethodDto,
  CodeExecutionSourceDto,
  NotificationDto,
  ApiResponse,
} from './dto';

@ApiTags('unions')
@Controller('unions')
export class UnionsController {
  @Get('payment-methods')
  @ApiOperation({ summary: 'Get available payment methods' })
  getPaymentMethods(): PaymentMethodDto[] {
    return [];
  }

  @Post('payment')
  @ApiOperation({ summary: 'Process a payment' })
  processPayment(
    @Body() _payment: PaymentMethodDto,
  ): ApiResponse<{ success: boolean }> {
    return { data: { success: true }, timestamp: new Date().toISOString() };
  }

  @Get('code-sources')
  @ApiOperation({ summary: 'Get code execution sources' })
  getCodeSources(): CodeExecutionSourceDto[] {
    return [];
  }

  @Post('notification')
  @ApiOperation({ summary: 'Send a notification' })
  sendNotification(
    @Body() _notification: NotificationDto,
  ): ApiResponse<{ sent: boolean }> {
    return { data: { sent: true }, timestamp: new Date().toISOString() };
  }
}
