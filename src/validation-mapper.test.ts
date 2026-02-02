import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  extractPropertyConstraints,
  extractClassConstraints,
  isPropertyOptional,
  getRequiredProperties,
  applyConstraintsToSchema,
} from './validation-mapper.js';

// Helper to create an in-memory project with source code
function createProjectWithCode(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      skipLibCheck: true,
      skipDefaultLibCheck: true,
    },
  });
  return project.createSourceFile('/test.ts', code);
}

describe('validation-mapper', () => {
  describe('extractPropertyConstraints', () => {
    describe('string validators', () => {
      it('should extract MinLength constraint', () => {
        const sourceFile = createProjectWithCode(`
          import { MinLength } from 'class-validator';
          class TestDto {
            @MinLength(5)
            name: string;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('name')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.minLength).toBe(5);
      });

      it('should extract MaxLength constraint', () => {
        const sourceFile = createProjectWithCode(`
          import { MaxLength } from 'class-validator';
          class TestDto {
            @MaxLength(100)
            description: string;
          }
        `);
        const property = sourceFile
          .getClass('TestDto')!
          .getProperty('description')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.maxLength).toBe(100);
      });

      it('should extract Length constraint with min and max', () => {
        const sourceFile = createProjectWithCode(`
          import { Length } from 'class-validator';
          class TestDto {
            @Length(2, 50)
            username: string;
          }
        `);
        const property = sourceFile
          .getClass('TestDto')!
          .getProperty('username')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.minLength).toBe(2);
        expect(constraints.maxLength).toBe(50);
      });
    });

    describe('type validators', () => {
      it('should extract IsString type', () => {
        const sourceFile = createProjectWithCode(`
          import { IsString } from 'class-validator';
          class TestDto {
            @IsString()
            name: string;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('name')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.type).toBe('string');
      });

      it('should extract IsNumber type', () => {
        const sourceFile = createProjectWithCode(`
          import { IsNumber } from 'class-validator';
          class TestDto {
            @IsNumber()
            age: number;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('age')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.type).toBe('number');
      });
    });

    describe('format validators', () => {
      it('should extract IsEmail format', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEmail } from 'class-validator';
          class TestDto {
            @IsEmail()
            email: string;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('email')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.format).toBe('email');
      });

      it('should extract IsUUID format', () => {
        const sourceFile = createProjectWithCode(`
          import { IsUUID } from 'class-validator';
          class TestDto {
            @IsUUID()
            id: string;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('id')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.format).toBe('uuid');
      });
    });

    describe('number validators', () => {
      it('should extract Min and Max constraints', () => {
        const sourceFile = createProjectWithCode(`
          import { Min, Max } from 'class-validator';
          class TestDto {
            @Min(0)
            @Max(100)
            score: number;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('score')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.minimum).toBe(0);
        expect(constraints.maximum).toBe(100);
      });
    });

    describe('enum validators', () => {
      it('should extract enum values from @IsEnum with string enum', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEnum } from 'class-validator';
          
          enum Status {
            Active = 'active',
            Inactive = 'inactive',
            Pending = 'pending',
          }
          
          class TestDto {
            @IsEnum(Status)
            status: Status;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('status')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.enum).toEqual(['active', 'inactive', 'pending']);
      });

      it('should extract enum values from @IsEnum with numeric enum', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEnum } from 'class-validator';
          
          enum Priority {
            Low = 1,
            Medium = 2,
            High = 3,
          }
          
          class TestDto {
            @IsEnum(Priority)
            priority: Priority;
          }
        `);
        const property = sourceFile
          .getClass('TestDto')!
          .getProperty('priority')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.enum).toEqual([1, 2, 3]);
      });

      it('should extract enum values from @IsEnum with implicit numeric enum', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEnum } from 'class-validator';
          
          enum Color {
            Red,
            Green,
            Blue,
          }
          
          class TestDto {
            @IsEnum(Color)
            color: Color;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('color')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.enum).toEqual([0, 1, 2]);
      });

      it('should extract enum values from @IsEnum with mixed enum', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEnum } from 'class-validator';
          
          enum MixedStatus {
            Unknown = 0,
            Active = 'active',
            Disabled = 'disabled',
          }
          
          class TestDto {
            @IsEnum(MixedStatus)
            status: MixedStatus;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('status')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.enum).toEqual([0, 'active', 'disabled']);
      });

      it('should handle enum defined in a different file (imported)', () => {
        const project = new Project({
          useInMemoryFileSystem: true,
          compilerOptions: {
            skipLibCheck: true,
            skipDefaultLibCheck: true,
          },
        });

        // Create enum in separate file
        project.createSourceFile(
          '/enums.ts',
          `
          export enum Role {
            Admin = 'admin',
            User = 'user',
            Guest = 'guest',
          }
        `,
        );

        // Create DTO that imports the enum
        const sourceFile = project.createSourceFile(
          '/dto.ts',
          `
          import { IsEnum } from 'class-validator';
          import { Role } from './enums';
          
          class UserDto {
            @IsEnum(Role)
            role: Role;
          }
        `,
        );

        const property = sourceFile.getClass('UserDto')!.getProperty('role')!;

        const constraints = extractPropertyConstraints(property);

        expect(constraints.enum).toEqual(['admin', 'user', 'guest']);
      });

      it('should return empty constraints for @IsEnum with unresolvable enum', () => {
        const sourceFile = createProjectWithCode(`
          import { IsEnum } from 'class-validator';
          
          // Enum not defined - simulating unresolvable reference
          declare const UnknownEnum: any;
          
          class TestDto {
            @IsEnum(UnknownEnum)
            value: unknown;
          }
        `);
        const property = sourceFile.getClass('TestDto')!.getProperty('value')!;

        const constraints = extractPropertyConstraints(property);

        // Should not crash, just return empty enum
        expect(constraints.enum).toBeUndefined();
      });
    });
  });

  describe('isPropertyOptional', () => {
    it('should return true for property with @IsOptional()', () => {
      const sourceFile = createProjectWithCode(`
        import { IsOptional } from 'class-validator';
        class TestDto {
          @IsOptional()
          nickname?: string;
        }
      `);
      const property = sourceFile.getClass('TestDto')!.getProperty('nickname')!;

      expect(isPropertyOptional(property)).toBe(true);
    });

    it('should return false for property without @IsOptional()', () => {
      const sourceFile = createProjectWithCode(`
        class TestDto {
          name: string;
        }
      `);
      const property = sourceFile.getClass('TestDto')!.getProperty('name')!;

      expect(isPropertyOptional(property)).toBe(false);
    });
  });

  describe('extractClassConstraints', () => {
    it('should extract constraints from all properties', () => {
      const sourceFile = createProjectWithCode(`
        import { MinLength, MaxLength, IsEmail, IsEnum } from 'class-validator';
        
        enum Role { Admin = 'admin', User = 'user' }
        
        class UserDto {
          @MinLength(2)
          @MaxLength(50)
          name: string;
          
          @IsEmail()
          email: string;
          
          @IsEnum(Role)
          role: Role;
        }
      `);
      const classDecl = sourceFile.getClass('UserDto')!;

      const constraints = extractClassConstraints(classDecl);

      expect(constraints.name).toEqual({ minLength: 2, maxLength: 50 });
      expect(constraints.email).toEqual({ format: 'email' });
      expect(constraints.role).toEqual({ enum: ['admin', 'user'] });
    });
  });

  describe('getRequiredProperties', () => {
    it('should return properties without @IsOptional', () => {
      const sourceFile = createProjectWithCode(`
        import { IsOptional } from 'class-validator';
        class TestDto {
          name: string;
          
          @IsOptional()
          nickname?: string;
          
          email: string;
        }
      `);
      const classDecl = sourceFile.getClass('TestDto')!;

      const required = getRequiredProperties(classDecl);

      expect(required).toEqual(['name', 'email']);
    });
  });

  describe('applyConstraintsToSchema', () => {
    it('should apply enum constraints to schema properties', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string' },
          name: { type: 'string' },
        },
      };
      const constraints = {
        status: { enum: ['active', 'inactive'] as readonly unknown[] },
      };

      const result = applyConstraintsToSchema(schema, constraints);

      expect(result.properties!.status).toEqual({
        type: 'string',
        enum: ['active', 'inactive'],
      });
      expect(result.properties!.name).toEqual({ type: 'string' });
    });
  });
});
