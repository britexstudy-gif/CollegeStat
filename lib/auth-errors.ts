import type { MessageKey } from './i18n/messages';

/** Wrong digits and an old code look the same to Supabase (`otp_expired`), so the message covers both. */
export type AuthFailure = 'wrong_or_expired' | 'too_many' | 'email_limit' | 'network' | 'signups_closed' | 'invalid_email' | 'blocked' | 'unknown';

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;
/** Wrong guesses allowed locally before the code is retired and a new one is needed. */
export const MAX_CODE_ATTEMPTS = 5;

/** Digits only, at most six: accepts pasted "123 456" or "123-456". */
export const cleanCode = (value: string) => value.replace(/\D/g, '').slice(0, OTP_LENGTH);

export function classifyAuthError(cause: unknown): AuthFailure {
  const e = (cause && typeof cause === 'object' ? cause : {}) as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : 0;
  if (code === 'over_email_send_rate_limit') return 'email_limit';
  if (code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit' || code.includes('rate_limit') || status === 429) return 'too_many';
  if (code === 'otp_expired' || code === 'validation_failed' || code === 'flow_state_expired' || code === 'flow_state_not_found' || message.includes('expired or is invalid'))
    return 'wrong_or_expired';
  if (code === 'otp_disabled' || code === 'signup_disabled') return 'signups_closed';
  if (code === 'email_address_invalid') return 'invalid_email';
  if (code === 'user_banned') return 'blocked';
  if (name === 'AuthRetryableFetchError' || name === 'TypeError' || status === 0 || message.includes('fetch') || message.includes('network')) return 'network';
  return 'unknown';
}

const KEYS: Record<AuthFailure, MessageKey> = {
  wrong_or_expired: 'au.err.wrong',
  too_many: 'au.err.tooMany',
  email_limit: 'au.err.emailLimit',
  network: 'au.err.network',
  signups_closed: 'au.err.closed',
  invalid_email: 'au.err.email',
  blocked: 'au.err.blocked',
  unknown: 'au.err.unknown',
};
export const authErrorKey = (cause: unknown): MessageKey => KEYS[classifyAuthError(cause)];
