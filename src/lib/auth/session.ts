import "server-only"

import { connection } from "next/server"
import { redirect } from "next/navigation"
import { cache } from "react"

import { isConfirmedAccount } from "@/lib/auth/access"
import { createClient } from "@/lib/supabase/server"

export type AuthenticatedUser = {
  id: string
  email: string | null
}

/**
 * The signed-in user for this request. React `cache` memoizes it for one
 * server request only, so the layout, page, and every loader share a single
 * auth check instead of each calling the auth server. Nothing is shared
 * across requests or users.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) {
    return null
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return null
  }
  if (!isConfirmedAccount(userData.user)) {
    await supabase.auth.signOut()
    return null
  }

  return {
    id: userData.user.id,
    email: userData.user.email ?? data.claims.email ?? null,
  }
})

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}
