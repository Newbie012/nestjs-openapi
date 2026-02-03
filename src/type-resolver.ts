/**
 * Type Resolver - Uses ts-morph to find source files for missing types
 *
 * This module provides a hybrid approach for schema generation by
 * discovering type definitions that aren't covered by the dtoGlob patterns.
 */

import { Project } from 'ts-morph';
import { Option } from 'effect';
import type { MethodInfo } from './domain.js';

/**
 * Information about a resolved type
 */
export interface ResolvedType {
  /** The type name (e.g., "UserDto", "GetUsersQueryParams") */
  readonly typeName: string;
  /** The absolute file path where the type is defined */
  readonly filePath: string;
}

/**
 * Extracts all unique file paths from method infos where types are defined.
 * This includes return types that have resolved file paths.
 */
export function extractTypeFilePaths(
  methodInfos: readonly MethodInfo[],
): Set<string> {
  const filePaths = new Set<string>();

  for (const method of methodInfos) {
    // Add return type file path if present
    if (Option.isSome(method.returnType.filePath)) {
      const path = method.returnType.filePath.value;
      // Exclude node_modules paths
      if (!path.includes('node_modules')) {
        filePaths.add(path);
      }
    }
  }

  return filePaths;
}

/**
 * Resolves missing type names to their source file paths using ts-morph.
 *
 * This function searches the project for type definitions and returns
 * the file paths where they are defined.
 *
 * @param project - ts-morph Project instance
 * @param missingTypes - Set of type names to resolve
 * @returns Map of type name to resolved file path
 */
export function resolveTypeLocations(
  project: Project,
  missingTypes: Set<string>,
): Map<string, string> {
  const resolved = new Map<string, string>();

  // Build an index of all exported types in the project
  const typeIndex = buildTypeIndex(project);

  for (const typeName of missingTypes) {
    // Strip generic parameters for lookup (e.g., "PaginatedResponse<User>" -> "PaginatedResponse")
    const baseTypeName = typeName.replace(/<.*>$/, '');

    const filePath = typeIndex.get(baseTypeName);
    if (filePath && !filePath.includes('node_modules')) {
      resolved.set(typeName, filePath);
    }
  }

  return resolved;
}

/**
 * Builds an index of all exported class/interface/type names to their file paths.
 */
function buildTypeIndex(project: Project): Map<string, string> {
  const index = new Map<string, string>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Skip node_modules
    if (filePath.includes('node_modules')) continue;

    // Index exported classes
    for (const cls of sourceFile.getClasses()) {
      if (cls.isExported()) {
        const name = cls.getName();
        if (name) {
          index.set(name, filePath);
        }
      }
    }

    // Index exported interfaces
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.isExported()) {
        const name = iface.getName();
        index.set(name, filePath);
      }
    }

    // Index exported type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (typeAlias.isExported()) {
        const name = typeAlias.getName();
        index.set(name, filePath);
      }
    }

    // Index exported enums
    for (const enumDecl of sourceFile.getEnums()) {
      if (enumDecl.isExported()) {
        const name = enumDecl.getName();
        index.set(name, filePath);
      }
    }
  }

  return index;
}

/**
 * Gets unique directories containing the resolved types.
 * Useful for expanding dtoGlob patterns.
 */
export function getTypeDirectories(
  resolvedTypes: Map<string, string>,
): Set<string> {
  const dirs = new Set<string>();

  for (const filePath of resolvedTypes.values()) {
    // Extract directory from file path
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash !== -1) {
      dirs.add(filePath.substring(0, lastSlash));
    }
  }

  return dirs;
}

/**
 * Creates a ts-morph Project configured for type resolution.
 * Uses minimal compiler options for performance.
 */
export function createTypeResolverProject(tsconfig: string): Project {
  return new Project({
    tsConfigFilePath: tsconfig,
    skipAddingFilesFromTsConfig: false, // Need all files for type resolution
    compilerOptions: {
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      declaration: false,
      noEmit: true,
    },
  });
}

import { execSync } from 'child_process';

/**
 * Check if ripgrep (rg) is available
 */
function hasRipgrep(): boolean {
  try {
    execSync('rg --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fast type resolution using simple file content search.
 * Uses ripgrep if available (much faster), falls back to grep.
 *
 * @param baseDir - Base directory to search from (usually tsconfig directory)
 * @param missingTypes - Set of type names to resolve
 * @returns Map of type name to resolved file path
 */
export function resolveTypeLocationsFast(
  baseDir: string,
  missingTypes: Set<string>,
): Map<string, string> {
  const resolved = new Map<string, string>();

  // Strip generics from type names
  const typeNames = [...missingTypes].map((t) => t.replace(/<.*>$/, ''));

  // Build a single pattern for all types: (Type1|Type2|Type3)
  const typePattern = typeNames.join('|');
  const pattern = `export\\s+(class|interface|type|enum)\\s+(${typePattern})\\b`;

  // Common directories to exclude for performance
  const excludeDirs = [
    'node_modules',
    'dist',
    '.git',
    'coverage',
    '__snapshots__',
    '.turbo',
    '.next',
    'build',
  ];

  try {
    let result: string;

    if (hasRipgrep()) {
      // Use ripgrep (much faster for large codebases)
      const excludeArgs = excludeDirs.map((d) => `-g '!${d}/'`).join(' ');
      result = execSync(
        `rg -H --no-heading -t ts ${excludeArgs} '${pattern}' "${baseDir}" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      );
    } else {
      // Fall back to grep with exclusions
      const excludeArgs = excludeDirs
        .map((d) => `--exclude-dir=${d}`)
        .join(' ');
      result = execSync(
        `grep -r -H -E "${pattern}" --include="*.ts" ${excludeArgs} "${baseDir}" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      );
    }

    // Parse output: filename:match or filename:line:match
    for (const line of result.split('\n')) {
      if (!line.trim()) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const filePath = line.substring(0, colonIdx);

      // Skip node_modules (double-check in case exclude didn't work)
      if (filePath.includes('node_modules')) continue;

      // Extract the type name from the match
      for (const typeName of typeNames) {
        const typeRegex = new RegExp(
          `export\\s+(class|interface|type|enum)\\s+${typeName}\\b`,
        );
        if (typeRegex.test(line) && !resolved.has(typeName)) {
          resolved.set(typeName, filePath);
        }
      }
    }
  } catch {
    // grep/rg returns non-zero if no match, which throws - return what we have
  }

  return resolved;
}
