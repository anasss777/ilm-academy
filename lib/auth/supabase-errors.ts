// lib/auth/supabase-errors.ts
// Map Supabase Auth error codes to message keys in messages/*.json (auth.errors.*).
// The UI shows our own translated text, never Supabase's English messages.

export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "weakPassword"
  | "linkInvalid"
  | "generic";

export function supabaseErrorKey(error: { code?: string }): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "weak_password":
      return "weakPassword";
    case "session_not_found":
    case "otp_expired":
    case "flow_state_not_found":
    case "flow_state_expired":
      return "linkInvalid";
    default:
      return "generic";
  }
}
