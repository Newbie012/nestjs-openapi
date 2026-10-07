// Shared by every step of a run, so library and framework declarations are
// parsed and bound once instead of once per step
import { Project } from 'ts-morph';

const projects = new Map<string, Project>();

export const getRunProject = (tsconfig: string) => {
  const existing = projects.get(tsconfig);
  if (existing) return existing;

  const project = new Project({
    tsConfigFilePath: tsconfig,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      // Skip type checking for performance - we only need AST structure
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      allowJs: false,
      declaration: false,
      noEmit: true,
    },
  });
  projects.set(tsconfig, project);
  return project;
};

export const clearRunProjects = () => {
  projects.clear();
};
