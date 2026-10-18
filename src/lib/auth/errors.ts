export type AuthErrorInput = {
  message: string
  code?: string | null
  status?: number | null
}

const EXPIRED_LINK =
  "This link is invalid or has expired. Request a new one and try again."

export function mapAuthError(error: AuthErrorInput): string {
  const code = error.code ?? ""
  const message = error.message.toLowerCase()

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "Confirm your email before signing in. Check your inbox for the verification link."
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "Email or password is incorrect."
  }

  if (
    code === "user_already_exists" ||
    message.includes("user already registered") ||
    message.includes("already been registered")
  ) {
    return "An account with this email already exists. Sign in or reset your password."
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    message.includes("rate limit")
  ) {
    return "Too many attempts. Wait a few minutes and try again."
  }

  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    message.includes("expired") ||
    message.includes("invalid or has expired")
  ) {
    return EXPIRED_LINK
  }

  if (
    code === "same_password" ||
    message.includes("different from the old password")
  ) {
    return "Choose a password you have not used before."
  }

  if (code === "weak_password" || message.includes("password should")) {
    return "Use at least 8 characters, including a letter and a number."
  }

  return "Something went wrong. Try again."
}

export function mapPasswordChangeError(error: AuthErrorInput): string {
  const code = error.code ?? ""
  const message = error.message.toLowerCase()

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("current password")
  ) {
    return "Current password is incorrect."
  }

  return mapAuthError(error)
}
