import { describe, it, expect } from 'vitest';
import { isNullable, withNull } from './nullable.js';

describe('nullable', () => {
  describe('isNullable', () => {
    it('should read every form that allows null', () => {
      expect(isNullable({ type: 'string', nullable: true })).toBe(true);
      expect(isNullable({ type: ['string', 'null'] })).toBe(true);
      expect(
        isNullable({ anyOf: [{ type: 'string' }, { type: 'null' }] }),
      ).toBe(true);
      expect(
        isNullable({ oneOf: [{ type: 'string' }, { type: 'null' }] }),
      ).toBe(true);
    });

    it('should not read null from a schema that does not allow it', () => {
      expect(isNullable({ type: 'string' })).toBe(false);
      expect(isNullable({ type: 'string', nullable: false })).toBe(false);
      expect(isNullable({ anyOf: [{ type: 'string' }] })).toBe(false);
    });
  });

  describe('withNull', () => {
    it('should add nullable beside the schema keywords', () => {
      expect(withNull({ type: 'string' })).toEqual({
        type: 'string',
        nullable: true,
      });
    });

    it('should wrap a reference in allOf', () => {
      expect(withNull({ $ref: '#/components/schemas/User' })).toEqual({
        allOf: [{ $ref: '#/components/schemas/User' }],
        nullable: true,
      });
    });
  });
});
