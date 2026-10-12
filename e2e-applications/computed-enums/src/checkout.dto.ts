import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  UNRECOGNIZED = 'unrecognized',
}

export const PUBLIC_PAYMENT_METHODS = Object.values(PaymentMethod).filter(
  (value) => value !== PaymentMethod.UNRECOGNIZED,
);

declare function loadAllowedRegions(): string[];
declare function loadCardKey(): string;

export class CheckoutDto {
  @ApiPropertyOptional({
    description: 'Payment method',
    enum: PUBLIC_PAYMENT_METHODS,
  })
  @IsIn(PUBLIC_PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  // Not readable statically
  @ApiProperty({ enum: loadAllowedRegions() })
  region: string;

  // One key is readable, the other is not
  @ApiProperty({
    type: 'object',
    properties: {
      [PaymentMethod.PAYPAL]: { type: 'string' },
      [loadCardKey()]: { type: 'string' },
    },
  })
  accounts: Record<string, string>;
}
