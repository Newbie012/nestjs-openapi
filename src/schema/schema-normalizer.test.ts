import { describe, it, expect } from 'vitest';
import {
  toPascalCase,
  normalizeStructureRefs,
} from './schema-normalizer.js';
import type { GeneratedSchemas, JsonSchema } from './schema-generator.js';

describe('schema-normalizer', () => {
  describe('toPascalCase', () => {
    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('namespaceLabels')).toBe('NamespaceLabels');
      expect(toPascalCase('userName')).toBe('UserName');
      expect(toPascalCase('firstName')).toBe('FirstName');
    });

    it('should handle already PascalCase', () => {
      expect(toPascalCase('NamespaceLabels')).toBe('NamespaceLabels');
      expect(toPascalCase('User')).toBe('User');
    });

    it('should handle lowercase with numbers', () => {
      expect(toPascalCase('k8sLabels')).toBe('K8sLabels');
      expect(toPascalCase('s3Bucket')).toBe('S3Bucket');
    });

    it('should handle single lowercase word', () => {
      expect(toPascalCase('name')).toBe('Name');
      expect(toPascalCase('id')).toBe('Id');
    });

    it('should handle empty string', () => {
      expect(toPascalCase('')).toBe('');
    });
  });

  describe('normalizeStructureRefs', () => {
    it('should rename structure ref to property key PascalCase', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          VulnerabilityRules: {
            type: 'object',
            properties: {
              namespaceLabels: {
                $ref: '#/definitions/SelectRule<structure-123-456>',
              },
            },
          },
          'SelectRule<structure-123-456>': {
            type: 'object',
            properties: {
              include: { type: 'array' },
              exclude: { type: 'array' },
            },
          },
          'structure-123-456': {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // structure-123-456 should be renamed to NamespaceLabels
      expect(result.definitions['NamespaceLabels']).toBeDefined();
      expect(result.definitions['structure-123-456']).toBeUndefined();

      // SelectRule<structure-123-456> should become SelectRule<NamespaceLabels>
      expect(result.definitions['SelectRule<NamespaceLabels>']).toBeDefined();
      expect(
        result.definitions['SelectRule<structure-123-456>'],
      ).toBeUndefined();

      // Ref should be updated
      expect(
        result.definitions['VulnerabilityRules'].properties?.namespaceLabels
          .$ref,
      ).toBe('#/components/schemas/SelectRule<NamespaceLabels>');
    });

    it('should use parent+property when property name collides with existing schema', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          // Existing schema with the name we'd want to use
          NamespaceLabels: {
            type: 'object',
            properties: {
              existingProp: { type: 'string' },
            },
          },
          VulnerabilityRules: {
            type: 'object',
            properties: {
              namespaceLabels: {
                $ref: '#/definitions/structure-123-456',
              },
            },
          },
          'structure-123-456': {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // Original NamespaceLabels should still exist
      expect(result.definitions['NamespaceLabels']).toBeDefined();
      expect(
        result.definitions['NamespaceLabels'].properties?.existingProp,
      ).toBeDefined();

      // structure-123-456 should be renamed to VulnerabilityRulesNamespaceLabels
      expect(
        result.definitions['VulnerabilityRulesNamespaceLabels'],
      ).toBeDefined();
      expect(result.definitions['structure-123-456']).toBeUndefined();

      // Ref should be updated
      expect(
        result.definitions['VulnerabilityRules'].properties?.namespaceLabels
          .$ref,
      ).toBe('#/components/schemas/VulnerabilityRulesNamespaceLabels');
    });

    it('should add numeric suffix when parent+property also collides', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          // Both potential names already exist
          NamespaceLabels: {
            type: 'object',
            properties: { a: { type: 'string' } },
          },
          VulnerabilityRulesNamespaceLabels: {
            type: 'object',
            properties: { b: { type: 'string' } },
          },
          VulnerabilityRules: {
            type: 'object',
            properties: {
              namespaceLabels: {
                $ref: '#/definitions/structure-123-456',
              },
            },
          },
          'structure-123-456': {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // Original schemas should still exist
      expect(result.definitions['NamespaceLabels']).toBeDefined();
      expect(
        result.definitions['VulnerabilityRulesNamespaceLabels'],
      ).toBeDefined();

      // structure-123-456 should be renamed with numeric suffix
      expect(
        result.definitions['VulnerabilityRulesNamespaceLabels_1'],
      ).toBeDefined();
      expect(result.definitions['structure-123-456']).toBeUndefined();

      // Ref should be updated
      expect(
        result.definitions['VulnerabilityRules'].properties?.namespaceLabels
          .$ref,
      ).toBe('#/components/schemas/VulnerabilityRulesNamespaceLabels_1');
    });

    it('should handle multiple structure refs in same parent', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          VulnerabilityRules: {
            type: 'object',
            properties: {
              namespaceLabels: {
                $ref: '#/definitions/structure-111',
              },
              k8sLabels: {
                $ref: '#/definitions/structure-222',
              },
            },
          },
          'structure-111': {
            type: 'object',
            properties: { key: { type: 'string' } },
          },
          'structure-222': {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // Both should be renamed based on their property keys
      expect(result.definitions['NamespaceLabels']).toBeDefined();
      expect(result.definitions['K8sLabels']).toBeDefined();
      expect(result.definitions['structure-111']).toBeUndefined();
      expect(result.definitions['structure-222']).toBeUndefined();

      // Refs should be updated
      expect(
        result.definitions['VulnerabilityRules'].properties?.namespaceLabels
          .$ref,
      ).toBe('#/components/schemas/NamespaceLabels');
      expect(
        result.definitions['VulnerabilityRules'].properties?.k8sLabels.$ref,
      ).toBe('#/components/schemas/K8sLabels');
    });

    it('should handle nested generic with structure ref', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          FilterRules: {
            type: 'object',
            properties: {
              tags: {
                $ref: '#/definitions/SelectRule<structure-999>',
              },
            },
          },
          'SelectRule<structure-999>': {
            type: 'object',
            properties: {
              include: {
                type: 'array',
                items: { $ref: '#/definitions/structure-999' },
              },
            },
          },
          'structure-999': {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // structure-999 should be renamed to Tags
      expect(result.definitions['Tags']).toBeDefined();
      expect(result.definitions['structure-999']).toBeUndefined();

      // SelectRule<structure-999> should become SelectRule<Tags>
      expect(result.definitions['SelectRule<Tags>']).toBeDefined();
      expect(result.definitions['SelectRule<structure-999>']).toBeUndefined();

      // Nested ref inside SelectRule should also be updated
      expect(
        (
          result.definitions['SelectRule<Tags>'].properties?.include
            .items as JsonSchema
        )?.$ref,
      ).toBe('#/components/schemas/Tags');
    });

    it('names a wrapper over a checker ID after the declaration it wraps', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          Owner: {
            type: 'object',
            properties: {
              pet: {
                anyOf: [
                  { $ref: '#/definitions/Box<class-123-4-5>' },
                  { type: 'null' },
                ],
              },
            },
          },
          Pet: { type: 'object', properties: { id: { type: 'string' } } },
          'Box<class-123-4-5>': {
            $ref: '#/definitions/Pet',
            description: 'A transparent wrapper',
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      expect(Object.keys(result.definitions).sort()).toEqual([
        'Box<Pet>',
        'Owner',
        'Pet',
      ]);
      expect(result.definitions['Owner'].properties?.pet.anyOf?.[0]).toEqual({
        $ref: '#/components/schemas/Box<Pet>',
      });
    });

    it('should preserve non-structure schemas unchanged', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: { $ref: '#/definitions/Profile' },
            },
          },
          Profile: {
            type: 'object',
            properties: {
              bio: { type: 'string' },
            },
          },
          'SelectRule<string>': {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // All non-structure schemas should remain
      expect(result.definitions['User']).toBeDefined();
      expect(result.definitions['Profile']).toBeDefined();
      expect(result.definitions['SelectRule<string>']).toBeDefined();

      // Refs should be converted to components/schemas format
      expect(result.definitions['User'].properties?.profile.$ref).toBe(
        '#/components/schemas/Profile',
      );
    });

    it('should handle structure ref used directly without generic wrapper', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          Config: {
            type: 'object',
            properties: {
              labels: {
                $ref: '#/definitions/structure-888',
              },
            },
          },
          'structure-888': {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // structure-888 should be renamed to Labels
      expect(result.definitions['Labels']).toBeDefined();
      expect(result.definitions['structure-888']).toBeUndefined();

      // Ref should be updated
      expect(result.definitions['Config'].properties?.labels.$ref).toBe(
        '#/components/schemas/Labels',
      );
    });

    it('should normalize class- refs the same as structure- refs', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          EntityRelations: {
            type: 'object',
            properties: {
              libraries: {
                $ref: '#/definitions/Relation<class-1038812259-491-2678>',
              },
              instances: {
                $ref: '#/definitions/Relation<class-2009888590-1446-4047>',
              },
            },
          },
          'Relation<class-1038812259-491-2678>': {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
          'Relation<class-2009888590-1446-4047>': {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
          'class-1038812259-491-2678': {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          'class-2009888590-1446-4047': {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // class- refs should be normalized to property names
      expect(result.definitions['Libraries']).toBeDefined();
      expect(result.definitions['Instances']).toBeDefined();
      expect(result.definitions['class-1038812259-491-2678']).toBeUndefined();
      expect(result.definitions['class-2009888590-1446-4047']).toBeUndefined();

      // Generic wrappers should be updated
      expect(result.definitions['Relation<Libraries>']).toBeDefined();
      expect(result.definitions['Relation<Instances>']).toBeDefined();

      // Refs should be updated
      expect(
        result.definitions['EntityRelations'].properties?.libraries.$ref,
      ).toBe('#/components/schemas/Relation<Libraries>');
      expect(
        result.definitions['EntityRelations'].properties?.instances.$ref,
      ).toBe('#/components/schemas/Relation<Instances>');
    });

    it('should handle mixed structure- and class- refs', () => {
      const schemas: GeneratedSchemas = {
        definitions: {
          MixedRules: {
            type: 'object',
            properties: {
              labels: {
                $ref: '#/definitions/SelectRule<structure-123>',
              },
              relations: {
                $ref: '#/definitions/Relation<class-456>',
              },
            },
          },
          'SelectRule<structure-123>': {
            type: 'object',
            properties: { include: { type: 'array' } },
          },
          'Relation<class-456>': {
            type: 'object',
            properties: { data: { type: 'array' } },
          },
          'structure-123': {
            type: 'object',
            properties: { key: { type: 'string' } },
          },
          'class-456': {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      };

      const result = normalizeStructureRefs(schemas);

      // Both should be normalized
      expect(result.definitions['Labels']).toBeDefined();
      expect(result.definitions['Relations']).toBeDefined();
      expect(result.definitions['SelectRule<Labels>']).toBeDefined();
      expect(result.definitions['Relation<Relations>']).toBeDefined();

      // No ugly refs should remain
      expect(result.definitions['structure-123']).toBeUndefined();
      expect(result.definitions['class-456']).toBeUndefined();
    });
  });
});
