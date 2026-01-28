import { Resolver } from "./resolver";
import { OpenApiTransformer } from "./openapi-transformer";
import { ControllerMethodInfo } from "./nest-resolved-method";

function collectMethodInfos(params: {
  resolver: Resolver;
  limit: number;
}): ControllerMethodInfo[] {
  const { resolver, limit } = params;

  return resolver
    .getModules()
    .flatMap((group) => group.controllers)
    .flatMap((controller) => controller.getMethods())
    .map((method) => method.getInfo())
    .slice(0, limit);
}

function main() {
  const resolver = new Resolver({
    tsconfig: `/Users/eliya/projects/oligo/platform/tsconfig.json`,
    entry: `/Users/eliya/projects/oligo/platform/apps/backend-api/src/app.module.ts`,
  });

  console.log("=== Raw NestJS Data ===");
  const nestData = collectMethodInfos({ resolver, limit: 3 });
  console.log(JSON.stringify(nestData, null, 2));

  console.log("\n=== OpenAPI Transformed Data ===");
  const transformer = new OpenApiTransformer();
  const openApiData = nestData.map((method) => transformer.transformMethodInfo(method));

  openApiData.forEach((endpoint) => {
    console.log(JSON.stringify(endpoint, null, 2));
  });
}

main();
