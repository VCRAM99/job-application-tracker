"use server"

import { revalidatePath } from "next/cache"

import { sha256 } from "@/lib/ai/crypto"
import { done, fail, ready } from "@/lib/career/action-utils"
import { arrangementsFrom, parseTokenList, profileFormSchema, sourceFormSchema } from "@/lib/career/schemas"
import { formText, type RecordFormState } from "@/lib/records/form-state"

export async function saveCareerProfile(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = profileFormSchema.safeParse({
    summary: formText(formData, "summary"),
    targetRoles: formText(formData, "targetRoles"),
    countries: formText(formData, "countries"),
    remote: formData.get("remote") === "on",
    hybrid: formData.get("hybrid") === "on",
    onsite: formData.get("onsite") === "on",
    salaryFloor: formText(formData, "salaryFloor"),
    salaryCurrency: formText(formData, "salaryCurrency").toUpperCase(),
  })
  if (!parsed.success) return fail("Check the profile and try again.")
  const roles = parseTokenList(parsed.data.targetRoles, /^[\p{L}\p{N} .&/+-]{1,80}$/u, 12)
  const countries = parseTokenList(parsed.data.countries.toUpperCase(), /^[A-Z]{2}$/, 12)
  if (!roles.ok) return fail("Enter up to 12 target roles, separated by commas.")
  if (!countries.ok) return fail("Enter country codes such as CA, US.")
  const salaryFloor = parsed.data.salaryFloor ? Number(parsed.data.salaryFloor) : null
  if (parsed.data.salaryFloor && (!Number.isFinite(salaryFloor) || (salaryFloor ?? 0) < 0)) {
    return fail("Enter a salary floor of zero or more, or leave it blank.")
  }
  const currency = parsed.data.salaryCurrency || "USD"
  const { error } = await context.supabase
    .from("career_profiles")
    .update({
      summary: parsed.data.summary || null,
      target_roles: roles.items,
      countries: countries.items,
      work_arrangements: arrangementsFrom(parsed.data),
      salary_floor: salaryFloor,
      salary_currency: currency,
    })
    .eq("user_id", context.user.id)
  if (error) return fail("The profile could not be saved.")
  revalidatePath("/career")
  return done("Profile saved.")
}

export async function createCareerSource(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const context = await ready()
  if (!context.ok) return fail(context.message)
  const parsed = sourceFormSchema.safeParse({
    label: formText(formData, "label"),
    body: formText(formData, "body"),
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the resume text.")
  const profile = await context.supabase
    .from("career_profiles")
    .select("id")
    .eq("user_id", context.user.id)
    .maybeSingle()
  if (profile.error || !profile.data) return fail("Save a career profile before adding a resume.")
  const { error } = await context.supabase.from("career_sources").insert({
    user_id: context.user.id,
    profile_id: profile.data.id,
    label: parsed.data.label,
    body: parsed.data.body,
    sha256: sha256(parsed.data.body),
  })
  if (error) return fail("The resume text could not be saved.")
  revalidatePath("/career")
  return done("Resume source saved. Extraction will only propose facts until you accept them.")
}
