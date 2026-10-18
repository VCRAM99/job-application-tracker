import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ApplicationForm, emptyApplicationForm } from "@/components/records/application-form"
import { CompanyForm, emptyCompanyForm } from "@/components/records/company-form"
import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { RecordState } from "@/components/records/fields"
import LoadingApplications from "@/app/(app)/applications/loading"
import LoadingCompanies from "@/app/(app)/companies/loading"
import { initialRecordFormState } from "@/lib/records/form-state"

describe("record forms and states", () => {
  it("shows a company name error before calling the server", async () => {
    const user = userEvent.setup()
    const action = vi.fn().mockResolvedValue(initialRecordFormState)
    render(
      <CompanyForm
        action={action}
        values={emptyCompanyForm}
        submitLabel="Create company"
        cancelHref="/companies"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Create company" }))
    expect(await screen.findByText("Name is required.")).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it("shows an applied-date error before creating an application", async () => {
    const user = userEvent.setup()
    const action = vi.fn().mockResolvedValue(initialRecordFormState)
    render(
      <ApplicationForm
        action={action}
        values={{ ...emptyApplicationForm, companyMode: "new", status: "applied" }}
        companies={[]}
        submitLabel="Create application"
        cancelHref="/applications"
      />,
    )

    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Engineer" } })
    fireEvent.change(screen.getByLabelText("New company name"), { target: { value: "Acme" } })
    await user.selectOptions(screen.getByLabelText("Status"), "applied")
    await user.click(screen.getByRole("button", { name: "Create application" }))

    expect(await screen.findByText(/applied date is required/i)).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it("asks for confirmation before deleting", async () => {
    const user = userEvent.setup()
    const action = vi.fn().mockResolvedValue(undefined)
    render(
      <DeleteRecordButton
        action={action}
        id="11111111-1111-4111-8111-111111111111"
        title="Delete Northwind?"
        description="This also deletes every application linked to this company."
        label="Delete company"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Delete company" }))
    expect(await screen.findByText("Delete Northwind?")).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it("renders empty, error, and loading states", () => {
    const { rerender } = render(
      <RecordState title="No companies yet" description="Add a company to get started." />,
    )
    expect(screen.getByRole("status").textContent).toContain("No companies yet")

    rerender(
      <RecordState
        tone="error"
        title="Companies could not be loaded"
        description="Apply the migration, then reload."
      />,
    )
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded")

    rerender(<LoadingCompanies />)
    expect(screen.getByRole("status").textContent).toContain("Loading companies")
    rerender(<LoadingApplications />)
    expect(screen.getByRole("status").textContent).toContain("Loading applications")
  })
})
