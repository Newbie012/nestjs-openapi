import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { Resolver } from "../src/resolver.js";
import { OpenApiTransformer } from "../src/openapi-transformer.js";

const apps = [
  ["monolith-todo-app", "e2e-applications/monolith-todo-app/src/app.module.ts"],
  ["user-service", "e2e-applications/microservices/apps/user-service/src/app.module.ts"],
  ["notification-service", "e2e-applications/microservices/apps/notification-service/src/app.module.ts"],
  ["api-gateway", "e2e-applications/microservices/apps/api-gateway/src/app.module.ts"],
];

describe("OpenAPI generation for E2E apps", () => {
  it.each(apps)("should generate OpenAPI spec for %s that matches snapshot", (name, entry) => {
    const resolver = new Resolver({
      tsconfig: resolve(process.cwd(), "tsconfig.json"),
      entry: resolve(process.cwd(), entry),
    });
    const transformer = new OpenApiTransformer();
    const methods = resolver
      .getModules()
      .flatMap((group) => group.controllers)
      .map((controller) => controller.getMethods())
      .flat()
      .map((method) => method.getInfo());
    const openApi = methods.reduce((acc, method) => {
      const endpoint = transformer.transformMethodInfo(method);
      for (const path in endpoint) {
        if (!acc[path]) acc[path] = {};
        Object.assign(acc[path], endpoint[path]);
      }
      return acc;
    }, {} as Record<string, Record<string, any>>);
    expect(openApi).toMatchSnapshot(`${name}-openapi`);
  });
});
