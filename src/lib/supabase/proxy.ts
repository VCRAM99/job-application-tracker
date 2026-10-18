import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { sessionGate } from "@/lib/auth/paths"
import { getPublicEnv } from "@/lib/env"

function withSession(from: NextResponse, to: NextResponse) {
  for (const cookie of from.headers.getSetCookie()) {
    to.headers.append("set-cookie", cookie)
  }

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header)
    if (value) to.headers.set(header, value)
  }

  return to
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const env = getPublicEnv()

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value)
          })
        },
      },
    },
  )

  let isAuthenticated = false
  try {
    const { data } = await supabase.auth.getClaims()
    isAuthenticated = Boolean(data?.claims)
  } catch (error) {
    console.error("Unable to refresh the Supabase session.", error)
  }

  const gate = sessionGate(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    isAuthenticated,
  )

  if (gate.type === "redirect") {
    const url = request.nextUrl.clone()
    url.pathname = gate.pathname
    url.search = gate.search
    return withSession(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}
