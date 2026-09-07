import { describe, it, expect, afterAll } from 'vitest';
import { generate } from '../src/generate.js';
import { resolve } from 'node:path';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';

describe('Discriminated Unions E2E', () => {
  const configPath = resolve(
    process.cwd(),
    'e2e-applications/discriminated-unions/openapi.config.ts',
  );
  const outputPath = resolve(
    process.cwd(),
    'e2e-applications/discriminated-unions/openapi.generated.json',
  );

  afterAll(() => {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  });

  it('should generate OpenAPI spec with discriminated unions', async () => {
    const result = await generate(configPath);

    expect(result.outputPath).toBe(outputPath);
    expect(existsSync(outputPath)).toBe(true);
  });

  describe('PaymentMethodDto discriminated union', () => {
    it('should have single-value enum type discriminators', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
      const schema = spec.components.schemas.PaymentMethodDto;

      expect(schema).toBeDefined();
      expect(schema.anyOf || schema.oneOf).toBeDefined();

      const variants = schema.anyOf || schema.oneOf;

      // Find the credit_card variant
      const creditCardVariant = variants.find(
        (v: any) =>
          v.properties?.type?.enum?.[0] === 'credit_card' ||
          v.properties?.cardNumber,
      );
      expect(creditCardVariant).toBeDefined();
      expect(creditCardVariant.properties.type).toMatchObject({
        enum: ['credit_card'],
      });

      // Find the paypal variant
      const paypalVariant = variants.find(
        (v: any) =>
          v.properties?.type?.enum?.[0] === 'paypal' || v.properties?.email,
      );
      expect(paypalVariant).toBeDefined();
      expect(paypalVariant.properties.type).toMatchObject({ enum: ['paypal'] });

      // Find the bank_transfer variant
      const bankTransferVariant = variants.find(
        (v: any) =>
          v.properties?.type?.enum?.[0] === 'bank_transfer' ||
          v.properties?.accountNumber,
      );
      expect(bankTransferVariant).toBeDefined();
      expect(bankTransferVariant.properties.type).toMatchObject({
        enum: ['bank_transfer'],
      });
    });
  });

  describe('CodeExecutionSourceDto discriminated union', () => {
    it('should have a single-value enum OpenSource discriminator', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
      const schema = spec.components.schemas.CodeExecutionSourceDto;

      expect(schema).toBeDefined();
      expect(schema.anyOf || schema.oneOf).toBeDefined();

      const variants = schema.anyOf || schema.oneOf;

      // Find the OpenSource variant (has libraryName)
      const openSourceVariant = variants.find(
        (v: any) => v.properties?.libraryName,
      );
      expect(openSourceVariant).toBeDefined();
      expect(openSourceVariant.properties.kind).toMatchObject({
        enum: ['OpenSource'],
      });
    });
  });

  describe('NotificationDto discriminated union', () => {
    it('should have single-value enum channel discriminators', async () => {
      const spec = JSON.parse(readFileSync(outputPath, 'utf-8'));
      const schema = spec.components.schemas.NotificationDto;

      expect(schema).toBeDefined();
      expect(schema.anyOf || schema.oneOf).toBeDefined();

      const variants = schema.anyOf || schema.oneOf;

      // Find the email variant
      const emailVariant = variants.find(
        (v: any) =>
          v.properties?.channel?.enum?.[0] === 'email' || v.properties?.subject,
      );
      expect(emailVariant).toBeDefined();
      expect(emailVariant.properties.channel).toMatchObject({
        enum: ['email'],
      });

      // Find the sms variant
      const smsVariant = variants.find(
        (v: any) =>
          v.properties?.channel?.enum?.[0] === 'sms' ||
          v.properties?.phoneNumber,
      );
      expect(smsVariant).toBeDefined();
      expect(smsVariant.properties.channel).toMatchObject({ enum: ['sms'] });

      // Find the push variant
      const pushVariant = variants.find(
        (v: any) =>
          v.properties?.channel?.enum?.[0] === 'push' ||
          v.properties?.deviceToken,
      );
      expect(pushVariant).toBeDefined();
      expect(pushVariant.properties.channel).toMatchObject({ enum: ['push'] });
    });
  });
});
