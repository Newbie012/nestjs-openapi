const DEFAULT_ERROR_MESSAGE = 'OpenAPI generation failed';

/**
 * Extract a consistent user-facing message from tagged errors or unknown causes.
 */
export const toUserFacingErrorMessage = (error: unknown): string =>
  error &&
  typeof error === 'object' &&
  'message' in error &&
  typeof error.message === 'string'
    ? error.message
    : DEFAULT_ERROR_MESSAGE;

