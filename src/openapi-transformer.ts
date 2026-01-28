import { ControllerMethodInfo, ResolvedParameter } from "./nest-resolved-method";

export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required: boolean;
  schema: {
    type: string;
    format?: string;
  };
};

export type OpenApiOperation = {
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    description?: string;
    required?: boolean;
    content: {
      [mediaType: string]: {
        schema: any;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content?: {
        [mediaType: string]: {
          schema: any;
        };
      };
    };
  };
  tags?: string[];
};

export type OpenApiEndpoint = {
  [path: string]: {
    [method: string]: OpenApiOperation;
  };
};

export class OpenApiTransformer {
  transformMethodInfo(methodInfo: ControllerMethodInfo): OpenApiEndpoint {
    const path = this.buildOpenApiPath(methodInfo);
    const method = methodInfo.httpMethod.toLowerCase();
    
    const operation: OpenApiOperation = {
      operationId: `${methodInfo.controllerName}_${methodInfo.methodName}`,
      summary: `${methodInfo.controllerName}.${methodInfo.methodName}`,
      tags: methodInfo.controllerTags.length > 0 ? methodInfo.controllerTags : undefined,
      responses: this.buildResponses(methodInfo.returnType)
    };

    const { parameters, requestBody } = this.buildParametersAndBody(methodInfo.parameters);
    
    if (parameters.length > 0) {
      operation.parameters = parameters;
    }
    
    if (requestBody) {
      operation.requestBody = requestBody;
    }

    return {
      [path]: {
        [method]: operation
      }
    };
  }

  private buildOpenApiPath(methodInfo: ControllerMethodInfo): string {
    // The path from methodInfo already includes the controller prefix
    let fullPath = methodInfo.path;
    
    // Transform :param to {param}
    fullPath = fullPath.replace(/:([^/]+)/g, '{$1}');
    
    return fullPath || '/';
  }

  private buildParametersAndBody(parameters: ResolvedParameter[]): {
    parameters: OpenApiParameter[];
    requestBody?: OpenApiOperation['requestBody'];
  } {
    return parameters.reduce<{
      parameters: OpenApiParameter[];
      requestBody?: OpenApiOperation['requestBody'];
    }>(
      (acc, param) => {
        if (param.type === 'body') {
          acc.requestBody = {
            description: `Request body parameter: ${param.name}`,
            required: param.required,
            content: {
              'application/json': {
                schema: this.tsTypeToOpenApiSchema(param.tsType),
              },
            },
          };
          return acc;
        }

        const location = this.getParameterLocation(param.type);

        acc.parameters.push({
          name: param.name,
          in: location,
          description: param.description || `${param.type} parameter: ${param.name}`,
          required: param.type === 'path' ? true : param.required,
          schema: this.tsTypeToOpenApiSchema(param.tsType),
        });

        return acc;
      },
      { parameters: [] }
    );
  }

  private buildResponses(returnType: ControllerMethodInfo['returnType']): OpenApiOperation['responses'] {
    const responses: OpenApiOperation['responses'] = {
      '200': {
        description: 'Success'
      }
    };

    if (returnType.type || returnType.inline) {
      responses['200'].content = {
        'application/json': {
          schema: this.buildResponseSchema(returnType)
        }
      };
    }

    return responses;
  }

  private getParameterLocation(
    type: ResolvedParameter['type']
  ): OpenApiParameter['in'] {
    if (type === 'path') return 'path';
    if (type === 'header') return 'header';
    if (type === 'cookie') return 'cookie';
    return 'query';
  }

  private buildResponseSchema(returnType: ControllerMethodInfo['returnType']): any {
    if (returnType.container === 'array') {
      return {
        type: 'array',
        items: returnType.type
          ? { $ref: `#/components/schemas/${returnType.type}` }
          : { type: 'object' }
      };
    } else if (returnType.type) {
      return { $ref: `#/components/schemas/${returnType.type}` };
    } else if (returnType.inline) {
      return { 
        type: 'object',
        description: `Inline type: ${returnType.inline}`
      };
    }

    return { type: 'string' };
  }

  private tsTypeToOpenApiSchema(tsType: string): any {
    const trimmed = tsType.trim();
    
    // Handle union types
    if (trimmed.includes(' | ')) {
      const types = trimmed.split(' | ').map(t => t.trim());
      return {
        oneOf: types.map(type => this.tsTypeToOpenApiSchema(type))
      };
    }

    // Handle basic types
    switch (trimmed.toLowerCase()) {
      case 'string':
        return { type: 'string' };
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'date':
        return { type: 'string', format: 'date-time' };
      case 'unknown':
      case 'any':
        return { type: 'object' };
    }

    // Handle arrays
    if (trimmed.endsWith('[]')) {
      const itemType = trimmed.slice(0, -2);
      return {
        type: 'array',
        items: this.tsTypeToOpenApiSchema(itemType)
      };
    }

    // Handle custom types (DTOs, interfaces, etc.) - reference to components
    if (trimmed.match(/^[A-Z][a-zA-Z0-9]*$/)) {
      return { $ref: `#/components/schemas/${trimmed}` };
    }

    // Default to object for complex/unknown types
    return { type: 'object' };
  }
}
