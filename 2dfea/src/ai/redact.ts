/**
 * Error / log redaction helpers (plan §5.14.9).
 *
 * Every error string that bubbles to the UI passes through {@link redactError}
 * so we never leak Bearer tokens, query-string keys, or stack frames that
 * happen to contain sensitive substrings.
 */

const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/g;
const QUERY_KEY_RE = /([?&](?:api[_-]?key|token|access_token)=)[^&\s"]+/gi;
const SK_LIKE_RE = /\b(?:sk|ghp|github_pat|sk-ant)[-_][A-Za-z0-9]+/g;

const MAX_ERROR_LEN = 500;

/**
 * Sanitise an error message for display. Redacts known-sensitive substrings,
 * trims the message to 500 chars (per plan §5.14.9), and falls back to a
 * generic string when the input is suspiciously empty or non-string.
 */
export function redactError(input: unknown): string {
  let msg: string;
  if (input instanceof Error) {
    msg = input.message ?? '';
  } else if (typeof input === 'string') {
    msg = input;
  } else if (input && typeof input === 'object' && 'message' in input) {
    msg = String((input as { message: unknown }).message ?? '');
  } else {
    msg = String(input ?? '');
  }

  msg = msg.replace(BEARER_RE, 'Bearer ***REDACTED***');
  msg = msg.replace(QUERY_KEY_RE, '$1***REDACTED***');
  msg = msg.replace(SK_LIKE_RE, '***REDACTED***');

  if (msg.length > MAX_ERROR_LEN) {
    msg = `${msg.slice(0, MAX_ERROR_LEN)}…`;
  }

  if (!msg.trim()) {
    return 'Something went wrong. Try again, and check the browser console for details.';
  }
  return msg;
}
