import { describe, it, expect } from 'vitest';
import { Project, ts } from 'ts-morph';
import { evaluate, toPlain } from './static-value.js';

const evaluateInitializer = (code: string, name = 'value') => {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('/test.ts', code);
  const initializer = sourceFile
    .getVariableDeclarationOrThrow(name)
    .getInitializerOrThrow();
  return evaluate(initializer);
};

const plain = (code: string) =>
  toPlain(evaluateInitializer(code), (value) =>
    value.kind === 'reference' ? `ref:${value.name}` : `unknown`,
  );

describe('static-value evaluate', () => {
  it('concatenates strings and numbers with +', () => {
    expect(plain(`const value = 'a ' + 'b' + 1;`)).toBe('a b1');
    expect(plain(`const value = 2 + 3 * 4;`)).toBe(14);
  });

  it('evaluates template literals with const and enum parts', () => {
    expect(
      plain(`
        const PREFIX = 'Price';
        enum Kind { Modification = 'modification' }
        const value = \`\${PREFIX} \${Kind.Modification} #\${1 + 1}\`;
      `),
    ).toBe('Price modification #2');
  });

  it('sees through parentheses, as const and satisfies', () => {
    expect(plain(`const value = ('x' + 'y') as const;`)).toBe('xy');
    expect(plain(`const value = ({ a: 'b' }) satisfies object;`)).toEqual({
      a: 'b',
    });
    expect(plain(`const value = ['a', 'b'] as const;`)).toEqual(['a', 'b']);
  });

  it('evaluates ?? and || with a static left side', () => {
    expect(plain(`const value = undefined ?? 'fallback';`)).toBe('fallback');
    expect(plain(`const value = '' || 'fallback';`)).toBe('fallback');
  });

  it('keeps a template with a non-static part unknown', () => {
    expect(plain(`declare const x: string; const value = \`a\${x}\`;`)).toBe(
      'unknown',
    );
  });

  it('evaluates multi-line descriptions built from several constants', () => {
    expect(
      plain(`
        const LINE_1 = 'First line.';
        const LINE_2 = 'Second line.';
        const value = { description: LINE_1 + ' ' + LINE_2 };
      `),
    ).toEqual({ description: 'First line. Second line.' });
  });

  it('evaluates Object.values(enum).filter(...) like the runtime', () => {
    expect(
      plain(`
        enum Framework { Npm = 'npm', Pypi = 'pypi', Unrecognized = 'unrecognized' }
        const value = Object.values(Framework).filter(
          (framework) => framework !== Framework.Unrecognized,
        );
      `),
    ).toEqual(['npm', 'pypi']);
  });

  it('includes reverse mappings of numeric enums, as the runtime does', () => {
    expect(
      plain(
        `enum Level { Low = 1, High = 2 } const value = Object.values(Level);`,
      ),
    ).toEqual(['Low', 'High', 1, 2]);
    expect(
      plain(
        `enum Level { Low = 1, High = 2 } const value = Object.values(Level).filter((v) => typeof v === 'number' || v === 'x');`,
      ),
    ).toBe('unknown');
  });

  it('evaluates keys, entries, map, concat, slice, includes and Set', () => {
    expect(plain(`const value = Object.keys({ a: 1, b: 2 });`)).toEqual([
      'a',
      'b',
    ]);
    expect(plain(`const value = Object.entries({ a: 1 });`)).toEqual([
      ['a', 1],
    ]);
    expect(plain(`const value = ['a', 'b'].map((x) => x + '!');`)).toEqual([
      'a!',
      'b!',
    ]);
    expect(plain(`const value = ['a'].concat(['b'], 'c').slice(1);`)).toEqual([
      'b',
      'c',
    ]);
    expect(plain(`const value = [...new Set(['a', 'a', 'b'])];`)).toEqual([
      'a',
      'b',
    ]);
    expect(
      plain(
        `const BLOCKED = ['b']; const value = ['a', 'b', 'c'].filter((x) => !BLOCKED.includes(x) && x !== 'c');`,
      ),
    ).toEqual(['a']);
    expect(plain(`const value = Object.freeze(['a', 'b'] as const);`)).toEqual([
      'a',
      'b',
    ]);
  });

  it('binds wrapper parameters through the environment', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/test.ts',
      'const value = `${prefix}-x`;',
    );
    const initializer = sourceFile
      .getVariableDeclarationOrThrow('value')
      .getInitializerOrThrow();
    const result = evaluate(
      initializer,
      new Map([['prefix', () => ({ kind: 'literal', value: 'p' }) as const]]),
    );
    expect(result).toEqual({ kind: 'literal', value: 'p-x' });
    expect(ts.SyntaxKind.TemplateExpression).toBeGreaterThan(0);
  });
});
