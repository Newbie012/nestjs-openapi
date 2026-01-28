import { ClassDeclaration, Project } from "ts-morph";
import { NestModuleExplorer } from "./nest-module-explorer";
import { Logger } from "./logger";

interface ResolverOptions {
  tsconfig: string;
  entry: string;
}

export interface Context {
  project: Project;
  entry: ClassDeclaration;
  logger: Logger;
}

export class Resolver {
  private readonly ctx: Context;
  private readonly explorer;

  constructor(public readonly options: ResolverOptions) {
    const logger = new Logger("Resolver");

    const project = new Project({
      tsConfigFilePath: this.options.tsconfig,
      skipAddingFilesFromTsConfig: true,
    });

    project.addSourceFilesAtPaths(this.options.entry);
    project.resolveSourceFileDependencies();

    logger.debug("Project initialized", { entry: this.options.entry });

    const entrySourceFile = project.getSourceFile(this.options.entry);
    const entryClassDeclaration = entrySourceFile?.getClass("AppModule");

    if (!entryClassDeclaration) {
      logger.error("Entry class not found", {
        entry: this.options.entry,
        className: "AppModule",
      });
      throw new Error("Entry class not found");
    }

    this.ctx = {
      project: project,
      entry: entryClassDeclaration,
      logger: logger,
    };

    this.explorer = new NestModuleExplorer(this.ctx);
  }

  getModules() {
    const controllers = this.explorer.getModules(
      this.ctx.entry
    );

    this.ctx.logger.debug("Controllers collected", {
      groups: controllers.length,
    });

    return controllers;
  }
}
