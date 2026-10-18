import { type EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

import { decideConfirm } from "@/lib/auth/confirm"
import { createClient } from "@/lib/supabase/server"

function loginWithError(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.search = "?error=expired"
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const decision = decideConfirm(request.nextUrl.searchParams)

  if (decision.kind === "expired") {
    return loginWithError(request)
  }

  if (decision.kind === "forward-recovery") {
    const url = request.nextUrl.clone()
    url.pathname = "/reset-password"
    url.search = ""
    url.searchParams.set("token_hash", decision.tokenHash)
    url.searchParams.set("type", "recovery")
    return NextResponse.redirect(url)
  }

  const supabase = await createClient()

  if (decision.kind === "verify-email") {
    const { error } = await supabase.auth.verifyOtp({
      type: decision.type as EmailOtpType,
      token_hash: decision.tokenHash,
    })

    if (error) return loginWithError(request)

    return NextResponse.redirect(new URL(decision.next, request.url))
  }

  const { error } = await supabase.auth.exchangeCodeForSession(decision.code)
  if (error) return loginWithError(request)

  return NextResponse.redirect(new URL(decision.next, request.url))
}
