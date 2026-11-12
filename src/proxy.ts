import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // /monitoring is the Sentry tunnel: no session refresh (one Supabase call) per error report.
    "/((?!_next/static|_next/image|favicon.ico|monitoring$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
