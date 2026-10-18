import "server-only"

import { connection } from "next/server"
import { redirect } from "next/navigation"

import { isConfirmedAccount } from "@/lib/auth/access"
import { createClient } from "@/lib/supabase/server"

export type AuthenticatedUser = {
  id: string
  email: string | null
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
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
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}
