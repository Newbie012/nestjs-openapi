import { unwrapThunk, type StaticValue } from './static-value.js';

/** HttpStatus enum values for resolving HttpStatus.XXX references */
const HTTP_STATUS_MAP: Record<string, number> = {
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLYHINTS: 103,
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  AMBIGUOUS: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  REQUESTED_RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  I_AM_A_TEAPOT: 418,
  MISDIRECTED: 421,
  UNPROCESSABLE_ENTITY: 422,
  FAILED_DEPENDENCY: 424,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
};

const toPascalCase = (constantName: string) =>
  constantName
    .split('_')
    .map((token) => `${token[0]!.toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join('');

// @nestjs/swagger derives its response shortcuts from HttpStatus the same
// way: `NOT_FOUND` → `ApiNotFoundResponse`
export const RESPONSE_DECORATOR_STATUS: Readonly<
  Record<string, number | 'default'>
> = {
  ...Object.fromEntries(
    Object.entries(HTTP_STATUS_MAP).map(([constantName, code]) => [
      `Api${toPascalCase(constantName)}Response`,
      code,
    ]),
  ),
  ApiDefaultResponse: 'default',
};

export const readStatusCode = (
  value: StaticValue | undefined,
): number | 'default' | undefined => {
  const unwrapped = unwrapThunk(value);
  if (!unwrapped) return undefined;

  if (unwrapped.kind === 'literal') {
    if (typeof unwrapped.value === 'number') return unwrapped.value;
    if (unwrapped.value === 'default') return 'default';
    if (
      typeof unwrapped.value === 'string' &&
      /^\d{3}$/.test(unwrapped.value)
    ) {
      return Number(unwrapped.value);
    }
    return undefined;
  }

  // HttpStatus.X whose enum could not be evaluated
  if (unwrapped.kind !== 'reference') return undefined;
  return HTTP_STATUS_MAP[unwrapped.name];
};
