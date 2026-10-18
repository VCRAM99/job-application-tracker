import { z } from "zod"

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.")

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
})

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((value) => value.password !== value.currentPassword, {
    path: ["password"],
    message: "Choose a password you have not used before.",
  })

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>

export type AuthField = "email" | "password" | "confirmPassword" | "currentPassword"

export function fieldErrorsFrom(error: z.ZodError): Partial<Record<AuthField, string>> {
  const fieldErrors: Partial<Record<AuthField, string>> = {}

  for (const issue of error.issues) {
    const key = issue.path[0]
    if (
      (key === "email" ||
        key === "password" ||
        key === "confirmPassword" ||
        key === "currentPassword") &&
      !fieldErrors[key]
    ) {
      fieldErrors[key] = issue.message
    }
  }

  return fieldErrors
}
