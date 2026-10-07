import { Option } from 'effect';
import type { RequestBodyMetadata, ResponseMetadata } from '../model/domain.js';
import type { DecoratorCall } from './decorators.js';
import { RESPONSE_DECORATOR_STATUS, readStatusCode } from './http-status.js';
import {
  asBoolean,
  asString,
  getProperty,
  toPlain,
  unwrapThunk,
  type StaticValue,
} from './static-value.js';

const PRIMITIVE_TYPE_NAMES: Readonly<Record<string, string>> = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Object: 'object',
  Date: 'Date',
};

const readTypeOption = (
  typeValue: StaticValue | undefined,
  isArrayValue: StaticValue | undefined,
): { readonly type: Option.Option<string>; readonly isArray: boolean } => {
  const explicitArray = asBoolean(isArrayValue) ?? false;
  const unwrapped = unwrapThunk(typeValue);

  if (unwrapped?.kind === 'array') {
    const element = readTypeOption(unwrapped.items[0], undefined);
    return { type: element.type, isArray: true };
  }

  const name =
    unwrapped?.kind === 'reference'
      ? (PRIMITIVE_TYPE_NAMES[unwrapped.name] ?? unwrapped.name)
      : asString(unwrapped);

  return { type: Option.fromNullable(name), isArray: explicitArray };
};

const readContentOptions = (options: StaticValue | undefined) => {
  const schemaOption = getProperty(options, 'schema');
  const schema =
    schemaOption?.kind === 'object' ? toPlain(schemaOption) : undefined;
  return {
    ...readTypeOption(
      getProperty(options, 'type'),
      getProperty(options, 'isArray'),
    ),
    description: Option.fromNullable(
      asString(getProperty(options, 'description')),
    ),
    ...(schema === undefined ? {} : { schema }),
  };
};

const RESPONSE_DECORATOR_NAMES = new Set([
  'ApiResponse',
  ...Object.keys(RESPONSE_DECORATOR_STATUS),
]);

const readStatus = (call: DecoratorCall) => {
  if (call.name !== 'ApiResponse') return RESPONSE_DECORATOR_STATUS[call.name];
  // @nestjs/swagger: `options.status || 'default'`
  return readStatusCode(getProperty(call.args[0], 'status')) ?? 'default';
};

const readResponse = (call: DecoratorCall): ResponseMetadata | undefined => {
  const statusCode = readStatus(call);
  if (statusCode === undefined) return undefined;
  return { statusCode, ...readContentOptions(call.args[0]) };
};

const readResponses = (calls: readonly DecoratorCall[]) => {
  const byStatus = new Map<string, ResponseMetadata>();
  for (const call of calls) {
    if (!RESPONSE_DECORATOR_NAMES.has(call.name)) continue;
    const response = readResponse(call);
    if (response) {
      byStatus.set(String(response.statusCode), response);
    }
  }
  return byStatus;
};

const mergeResponse = (
  fromClass: ResponseMetadata,
  fromMethod: ResponseMetadata,
): ResponseMetadata => {
  const schema = fromMethod.schema ?? fromClass.schema;
  return {
    statusCode: fromMethod.statusCode,
    description: Option.orElse(
      fromMethod.description,
      () => fromClass.description,
    ),
    type: Option.orElse(fromMethod.type, () => fromClass.type),
    isArray: Option.isSome(fromMethod.type)
      ? fromMethod.isArray
      : fromClass.isArray,
    ...(schema === undefined ? {} : { schema }),
  };
};

// As in @nestjs/swagger, the controller's responses apply to every method,
// field by field under the method's own for the same status
export const extractResponses = (
  controllerCalls: readonly DecoratorCall[],
  methodCalls: readonly DecoratorCall[],
): readonly ResponseMetadata[] => {
  const merged = readResponses(controllerCalls);
  for (const [status, response] of readResponses(methodCalls)) {
    const fromClass = merged.get(status);
    merged.set(
      status,
      fromClass ? mergeResponse(fromClass, response) : response,
    );
  }
  return [...merged.values()];
};

export const extractRequestBody = (
  methodCalls: readonly DecoratorCall[],
): RequestBodyMetadata | undefined => {
  const call = methodCalls.find((candidate) => candidate.name === 'ApiBody');
  if (!call) return undefined;
  return {
    ...readContentOptions(call.args[0]),
    required: Option.fromNullable(
      asBoolean(getProperty(call.args[0], 'required')),
    ),
  };
};
