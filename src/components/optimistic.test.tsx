import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const actions = vi.hoisted(() => ({
  updateApplicationStatus: vi.fn(),
  setTaskCompletion: vi.fn(),
  markDraftSent: vi.fn(),
}))

vi.mock("@/lib/records/actions", () => ({ updateApplicationStatus: actions.updateApplicationStatus }))
vi.mock("@/lib/records/tracker-actions", () => ({ setTaskCompletion: actions.setTaskCompletion }))
vi.mock("@/lib/coach/draft-actions", () => ({
  markDraftSent: actions.markDraftSent,
  regenerateDraft: vi.fn(),
  setDraftArchived: vi.fn(),
  deleteDraft: vi.fn(),
  createDraft: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import { DraftActions } from "@/components/coach/draft-forms"
import { JobActionForm } from "@/components/jobs/job-action-form"
import { ApplicationStatusLabel, ApplicationStatusScope, StatusForm } from "@/components/records/status-form"
import { TaskRow } from "@/components/tracker/task-row"
import type { TaskRecord } from "@/lib/records/tracker"

/** A promise the test resolves by hand, so the pending state can be observed. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const ID = "6b0839dd-fb11-41a2-ab72-8160d364e80e"

beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset()
})

describe("optimistic updates roll back when the server rejects them", () => {
  it("application status shows the new value while saving and returns on failure", async () => {
    const user = userEvent.setup()
    const reply = deferred<unknown>()
    actions.updateApplicationStatus.mockReturnValue(reply.promise)
    render(
      <ApplicationStatusScope status="applied">
        <StatusForm id={ID} status="applied" />
        <p data-testid="label">
          <ApplicationStatusLabel status="applied" />
        </p>
      </ApplicationStatusScope>,
    )
    await user.selectOptions(screen.getByLabelText("Status"), "recruiter_screen")
    await user.click(screen.getByRole("button", { name: "Update status" }))
    expect(screen.getByTestId("label").textContent).toBe("Recruiter Screen")
    await act(async () => reply.resolve({ status: "error", message: "That application could not be found.", fieldErrors: {} }))
    expect(screen.getByTestId("label").textContent).toBe("Applied")
    expect(await screen.findByText("That application could not be found.")).toBeTruthy()
    expect(actions.updateApplicationStatus.mock.calls[0]![1].get("status")).toBe("recruiter_screen")
  })

  it("puts the status select back on the saved status after a rejected change", async () => {
    const user = userEvent.setup()
    actions.updateApplicationStatus.mockResolvedValue({ status: "error", message: "Choose a valid status.", fieldErrors: {} })
    render(
      <ApplicationStatusScope status="applied">
        <StatusForm id={ID} status="applied" />
      </ApplicationStatusScope>,
    )
    await user.selectOptions(screen.getByLabelText("Status"), "offer")
    await user.click(screen.getByRole("button", { name: "Update status" }))
    expect(await screen.findByText("Choose a valid status.")).toBeTruthy()
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("applied")
  })

  it("a task shows Done while saving and returns when the saved status did not change", async () => {
    const user = userEvent.setup()
    const reply = deferred<void>()
    actions.setTaskCompletion.mockReturnValue(reply.promise)
    const task: TaskRecord = {
      id: ID,
      userId: "u",
      title: "Send portfolio link",
      description: null,
      status: "todo",
      priority: "medium",
      dueDate: null,
      companyId: null,
      companyName: null,
      applicationId: null,
      applicationTitle: null,
      completedAt: null,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    }
    render(
      <table>
        <tbody>
          <TaskRow task={task} today="2026-11-02" />
        </tbody>
      </table>,
    )
    await user.click(screen.getByRole("button", { name: "Mark complete" }))
    expect(screen.getByRole("cell", { name: "Done" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark incomplete" })).toBeTruthy()
    await act(async () => reply.resolve())
    expect(screen.getByRole("cell", { name: "To Do" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark complete" })).toBeTruthy()
    const sent = actions.setTaskCompletion.mock.calls[0]![0] as FormData
    expect([sent.get("id"), sent.get("completed")]).toEqual([ID, "true"])
  })

  it("a double click on a task sends one change", async () => {
    const user = userEvent.setup()
    const reply = deferred<void>()
    actions.setTaskCompletion.mockReturnValue(reply.promise)
    render(
      <table>
        <tbody>
          <TaskRow task={{ id: ID, userId: "u", title: "Call back", description: null, status: "todo", priority: "low", dueDate: null, companyId: null, companyName: null, applicationId: null, applicationTitle: null, completedAt: null, createdAt: "", updatedAt: "" }} today="2026-11-02" />
        </tbody>
      </table>,
    )
    await user.dblClick(screen.getByRole("button", { name: "Mark complete" }))
    expect(actions.setTaskCompletion).toHaveBeenCalledTimes(1)
    await act(async () => reply.resolve())
  })

  it("a job action shows the next label while saving and the original label with the error after", async () => {
    const user = userEvent.setup()
    const reply = deferred<{ status: "error"; message: string }>()
    const action = vi.fn().mockReturnValue(reply.promise)
    render(<JobActionForm action={action} fields={{ postingId: ID }} label="Save" optimisticLabel="Unsave" />)
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(screen.getByRole("button", { name: "Unsave" })).toBeTruthy()
    await act(async () => reply.resolve({ status: "error", message: "That job is no longer available." }))
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(screen.getByText("That job is no longer available.")).toBeTruthy()
  })

  it("mark as sent hides the draft buttons while saving and brings them back on failure", async () => {
    const user = userEvent.setup()
    const reply = deferred<unknown>()
    actions.markDraftSent.mockReturnValue(reply.promise)
    render(<DraftActions draftId={ID} status="draft" copyText="Hello" mailto={null} mode="byok" nonce="n" contactName="Dana Reyes" />)
    await user.click(screen.getByRole("button", { name: "Mark as sent" }))
    await user.click(screen.getByRole("dialog").querySelector("button:last-of-type") as HTMLElement)
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull()
    await act(async () => reply.resolve({ status: "error", message: "The draft could not be marked as sent.", fieldErrors: {} }))
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Mark as sent" })).toBeTruthy()
    expect(screen.getByText("The draft could not be marked as sent.")).toBeTruthy()
  })
})
