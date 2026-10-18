import "server-only"

import { connection } from "next/server"
import { redirect } from "next/navigation"

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

  return {
    id: data.claims.sub,
    email: data.claims.email ?? null,
  }
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/login")
  }
  return user
}
