import { resolve } from 'path';
import { Resolver } from '../../src/resolver.js';
import { OpenApiTransformer } from '../../src/openapi-transformer.js';

/**
 * Demo script showing E2E functionality with the example NestJS application
 */
function main() {
  console.log('🚀 E2E Demo: NestJS Application Analysis');
  console.log('==========================================\n');

  // Initialize resolver with our example NestJS application
  const exampleAppPath = resolve(
    process.cwd(),
    'e2e-applications/monolith-todo-app/src',
  );
  const resolver = new Resolver({
    tsconfig: resolve(process.cwd(), 'tsconfig.json'),
    entry: `${exampleAppPath}/app.module.ts`,
  });

  // Extract all controller methods
  const allMethods = resolver
    .getModules()
    .flatMap((group) => group.controllers)
    .map((controller) => controller.getMethods())
    .flat()
    .map((method) => method.getInfo());

  console.log(
    `📊 Discovered ${allMethods.length} endpoint methods across controllers\n`,
  );

  // Group by controllers
  const controllerGroups = allMethods.reduce(
    (acc, method) => {
      if (!acc[method.controllerName]) {
        acc[method.controllerName] = [];
      }
      acc[method.controllerName].push(method);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  // Display controller summary
  console.log('🏗️  Controller Summary:');
  Object.keys(controllerGroups).forEach((controller) => {
    const methods = controllerGroups[controller];
    console.log(`  • ${controller}: ${methods.length} methods`);
    methods.forEach((method) => {
      console.log(`    - ${method.httpMethod.padEnd(6)} ${method.path}`);
    });
  });

  console.log('\n📝 Sample Method Details (TodoController.findAll):');
  console.log('==================================================');
  const sampleMethod = allMethods.find(
    (m) =>
      m.controllerName === 'TodoController' &&
      m.httpMethod === 'GET' &&
      m.path === '/todos',
  );

  if (sampleMethod) {
    console.log(
      JSON.stringify(
        {
          controllerName: sampleMethod.controllerName,
          methodName: sampleMethod.methodName,
          httpMethod: sampleMethod.httpMethod,
          path: sampleMethod.path,
          parameters: sampleMethod.parameters,
          returnType: sampleMethod.returnType,
          controllerTags: sampleMethod.controllerTags,
        },
        null,
        2,
      ),
    );
  }

  console.log('\n🔄 OpenAPI Transformation Demo:');
  console.log('=================================');

  const transformer = new OpenApiTransformer();

  if (sampleMethod) {
    const openApiSpec = transformer.transformMethodInfo(sampleMethod);
    console.log('Generated OpenAPI specification:');
    console.log(JSON.stringify(openApiSpec, null, 2));
  }

  console.log('\n📈 Full OpenAPI Document Generation:');
  console.log('=====================================');

  // Generate complete OpenAPI paths object
  const allOpenApiSpecs = allMethods.map((method) =>
    transformer.transformMethodInfo(method),
  );

  const combinedPaths: Record<string, any> = {};
  allOpenApiSpecs.forEach((spec) => {
    Object.assign(combinedPaths, spec);
  });

  console.log(`Generated ${Object.keys(combinedPaths).length} OpenAPI paths:`);
  Object.keys(combinedPaths).forEach((path) => {
    const methods = Object.keys(combinedPaths[path]).join(', ').toUpperCase();
    console.log(`  ${path} [${methods}]`);
  });

  console.log('\n✅ E2E Demo Complete!');
  console.log(
    `Processed ${allMethods.length} endpoints from ${Object.keys(controllerGroups).length} controllers`,
  );
  console.log(
    'All methods successfully analyzed and transformed to OpenAPI format! 🎉',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
