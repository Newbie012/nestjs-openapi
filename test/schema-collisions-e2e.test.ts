import { describe, it, expect, afterAll } from 'vitest';
import { resolve } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { generate } from '../src/generate.js';
import type { OpenApiSpec } from '../src/types.js';

/**
 * Different declarations sharing a schema name. Fixture:
 * - shipping.dto.ts and get-order-summary.dto.ts each declare their
 *   own, non-exported AddressDto and ContactDto, used by their exported DTO;
 * - get-order-summary.dto.ts also has a local ProductDto, while
 *   catalog/dto/product.dto.ts exports another one used by /products;
 * - two exported PluginStateDto classes, imported under aliases;
 * - warehouse/dto/address.dto.ts exports yet another AddressDto that no
 *   route uses.
 */
describe('Schema name collisions E2E', () => {
  const fixtureDir = resolve(
    process.cwd(),
    'e2e-applications/schema-collisions',
  );
  const variants = [
    'inline',
    'rename',
    'function',
    'error',
    'shadowed',
  ] as const;
  type Variant = (typeof variants)[number];

  const run = async (variant: Variant) => {
    const result = await generate(
      resolve(fixtureDir, `openapi.${variant}.config.ts`),
    );
    const spec: OpenApiSpec = JSON.parse(
      readFileSync(
        resolve(fixtureDir, `openapi.${variant}.generated.json`),
        'utf-8',
      ),
    );
    return { result, spec };
  };

  afterAll(() => {
    for (const variant of variants) {
      const outputPath = resolve(
        fixtureDir,
        `openapi.${variant}.generated.json`,
      );
      if (existsSync(outputPath)) unlinkSync(outputPath);
    }
  });

  const responseSchema = (spec: OpenApiSpec, path: string) =>
    spec.paths[path]?.get?.responses['200']?.content?.['application/json']
      ?.schema;

  const shippingAddress = {
    type: 'object',
    additionalProperties: false,
    properties: { name: { type: 'string', nullable: true } },
  };
  const orderProduct = {
    type: 'object',
    additionalProperties: false,
    properties: {
      barcode: { type: 'string' },
      name: { type: 'string' },
      sku: { type: 'string' },
    },
    required: ['name', 'sku', 'barcode'],
  };

  describe("'inline' (default)", () => {
    it('writes each colliding schema in place, from the declaration it uses', async () => {
      const { result, spec } = await run('inline');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(schemas['ShipmentDto']?.properties?.['address']).toEqual(
        shippingAddress,
      );
      const orderAddress = schemas['OrderSummaryDto']?.properties?.['address'];
      expect(orderAddress?.required).toEqual(['id', 'product']);
      expect(orderAddress?.properties?.['product']).toEqual(orderProduct);
      expect(responseSchema(spec, '/products')).toEqual({
        type: 'array',
        items: expect.objectContaining({ required: ['variants', 'vendor'] }),
      });
      expect(responseSchema(spec, '/plugins/a')).toEqual(
        expect.objectContaining({ required: ['loaded'] }),
      );
      expect(responseSchema(spec, '/plugins/b')).toEqual(
        expect.objectContaining({ required: ['executed'] }),
      );
    });

    it('leaves no component under a colliding name', async () => {
      const { spec } = await run('inline');

      expect(Object.keys(spec.components?.schemas ?? {}).sort()).toEqual([
        'AddressPatchDto',
        'OrderSummaryDto',
        'ShipmentDto',
      ]);
    });

    it('inlines getSchemaPath() refs and generics over a colliding argument', async () => {
      const { spec } = await run('inline');

      expect(responseSchema(spec, '/products/raw')).toEqual({
        type: 'array',
        items: expect.objectContaining({ required: ['variants', 'vendor'] }),
      });
      expect(responseSchema(spec, '/plugins/page')).toEqual(
        expect.objectContaining({
          properties: expect.objectContaining({
            items: {
              type: 'array',
              items: expect.objectContaining({ required: ['loaded'] }),
            },
          }),
        }),
      );
    });
  });

  describe("'rename'", () => {
    it('gives each declaration a component named after its file', async () => {
      const { result, spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(Object.keys(schemas).sort()).toEqual(
        [
          'APluginState_PluginStateDto',
          'BPluginState_PluginStateDto',
          'Shipping_AddressDto',
          'Shipping_ContactDto',
          'GetOrderSummary_AddressDto',
          'GetOrderSummary_ProductDto',
          'GetOrderSummary_ContactDto',
          'Product_ProductDto',
          'OrderSummaryDto',
          'ShipmentDto',
          'PageDto_APluginState_PluginStateDto',
        ]
          .concat(['AddressPatchDto'])
          .sort(),
      );
      expect(schemas['Shipping_AddressDto']).toEqual(shippingAddress);
      expect(schemas['GetOrderSummary_ProductDto']).toEqual(orderProduct);
    });

    it('points every reference at the renamed component', async () => {
      const { spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      expect(schemas['ShipmentDto']?.properties?.['contact']).toEqual({
        $ref: '#/components/schemas/Shipping_ContactDto',
      });
      expect(
        schemas['GetOrderSummary_AddressDto']?.properties?.['product'],
      ).toEqual({
        $ref: '#/components/schemas/GetOrderSummary_ProductDto',
      });
      expect(responseSchema(spec, '/products')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Product_ProductDto' },
      });
      expect(responseSchema(spec, '/plugins/b')).toEqual({
        $ref: '#/components/schemas/BPluginState_PluginStateDto',
      });
    });

    it('resolves mapped-type bases, getSchemaPath() and generics by symbol', async () => {
      const { spec } = await run('rename');
      const schemas = spec.components?.schemas ?? {};

      // PartialType of shipping' local AddressDto
      expect(schemas['AddressPatchDto']).toEqual(shippingAddress);
      expect(responseSchema(spec, '/products/raw')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Product_ProductDto' },
      });
      expect(responseSchema(spec, '/plugins/page')).toEqual({
        $ref: '#/components/schemas/PageDto_APluginState_PluginStateDto',
      });
      expect(
        schemas['PageDto_APluginState_PluginStateDto']?.properties?.['items'],
      ).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/APluginState_PluginStateDto' },
      });
    });
  });

  describe('naming function', () => {
    it('names each colliding declaration with the returned name', async () => {
      const { result, spec } = await run('function');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(schemas['OrderSummaryDto']?.properties?.['address']).toEqual({
        $ref: '#/components/schemas/OrdersAddressDto',
      });
      expect(schemas['OrdersAddressDto']?.properties?.['product']).toEqual({
        $ref: '#/components/schemas/OrdersProductDto',
      });
      expect(responseSchema(spec, '/products')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/CatalogProductDto' },
      });
    });
  });

  describe("'error'", () => {
    it('fails, listing every colliding name and its files', async () => {
      await expect(
        generate(resolve(fixtureDir, 'openapi.error.config.ts')),
      ).rejects.toThrow(
        /AddressDto: src\/orders\/dto\/get-order-summary\.dto\.ts, src\/shipping\/shipping\.dto\.ts[\s\S]*PluginStateDto: src\/plugins\/a\/plugin-state\.dto\.ts, src\/plugins\/b\/plugin-state\.dto\.ts/,
      );
    });
  });

  describe('a name reached through one declaration', () => {
    it('keeps the name and uses the declaration actually reached', async () => {
      const { result, spec } = await run('shadowed');
      const schemas = spec.components?.schemas ?? {};

      expect(result.validation.brokenRefs).toEqual([]);
      expect(schemas['AddressDto']?.required).toEqual(['id', 'product']);
      expect(schemas['ProductDto']).toEqual(orderProduct);
    });
  });
});
