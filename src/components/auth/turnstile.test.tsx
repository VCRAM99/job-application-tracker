import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const SCRIPT = 'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  document.head.querySelectorAll(SCRIPT).forEach((node) => node.remove())
  delete window.turnstile
})

async function loadForm(siteKey: string | undefined) {
  if (siteKey !== undefined) vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey)
  vi.resetModules()
  const { LoginForm } = await import("@/components/auth/login-form")
  const { initialAuthFormState } = await import("@/lib/auth/form-state")
  render(<LoginForm authenticate={vi.fn().mockResolvedValue(initialAuthFormState)} nextPath="/dashboard" notice={null} />)
}

describe("Turnstile widget", () => {
  it("renders nothing and loads no script without a site key", async () => {
    await loadForm(undefined)
    expect(screen.queryByTestId("turnstile")).toBeNull()
    expect(document.head.querySelector(SCRIPT)).toBeNull()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy()
  })

  it("stays off for a malformed key", async () => {
    await loadForm("not a key")
    expect(screen.queryByTestId("turnstile")).toBeNull()
    expect(document.head.querySelector(SCRIPT)).toBeNull()
  })

  it("renders the widget inside the form with the token field name when a key is set", async () => {
    const renderWidget = vi.fn(() => "widget-1")
    window.turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
    await loadForm("1x00000000000000000000AA")
    const container = await screen.findByTestId("turnstile")
    expect(container.closest("form")).not.toBeNull()
    await vi.waitFor(() => expect(renderWidget).toHaveBeenCalled())
    expect(renderWidget).toHaveBeenCalledWith(container, expect.objectContaining({ sitekey: "1x00000000000000000000AA", action: "login", size: "flexible", "response-field-name": "cf-turnstile-response" }))
  })

  it("loads Cloudflare's script once, with explicit rendering", async () => {
    await loadForm("1x00000000000000000000AA")
    await vi.waitFor(() => expect(document.head.querySelectorAll(SCRIPT)).toHaveLength(1))
    expect(document.head.querySelector(SCRIPT)!.getAttribute("src")).toContain("render=explicit")
  })
})
