"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { FormStatus } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HelpTip } from "@/components/ui/help-tip"
import { deleteQuestionSet } from "@/lib/coach/actions"
import { deleteBrief } from "@/lib/coach/draft-actions"
import { initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"

export type Mode = "managed" | "byok"

/** Billing mode stays visible next to every AI action. */
export function ModePicker({ mode }: { mode: Mode }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3 text-sm">
      <legend className="sr-only">Billing</legend>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="executionMode" value="byok" defaultChecked={mode !== "managed"} /> Your key
      </label>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="executionMode" value="managed" defaultChecked={mode === "managed"} /> Managed
      </label>
    </fieldset>
  )
}

export function Run({ label, pending, pendingLabel, mode, help }: { label: string; pending: boolean; pendingLabel: string; mode: Mode; help: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <ModePicker mode={mode} />
      <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip>
    </div>
  )
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle")
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied("copied")
        } catch {
          // The browser can refuse clipboard access; say so instead of failing silently.
          setCopied("failed")
        }
        setTimeout(() => setCopied("idle"), 2000)
      }}
    >
      {copied === "copied" ? "Copied" : copied === "failed" ? "Copy blocked: select the text" : label}
    </Button>
  )
}

export function CopyText({ text }: { text: string }) {
  return <CopyButton text={text} />
}

export function DeleteMenu({ kind, id, redirectTo }: { kind: "set" | "brief"; id: string; redirectTo: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<RecordFormState>(initialRecordFormState)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" aria-label="More actions" />}>⋯</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormStatus state={message} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {kind === "set" ? "question set" : "brief"}?</DialogTitle>
            <DialogDescription>
              {kind === "set" ? "Its practice answers are removed too. Preparation items stay." : "Drafts that used it keep their text."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const form = new FormData()
                  form.set(kind === "set" ? "setId" : "briefId", id)
                  const result = kind === "set" ? await deleteQuestionSet(form) : await deleteBrief(form)
                  if (result.status === "error") {
                    setMessage(result)
                    setConfirming(false)
                    return
                  }
                  router.push(redirectTo)
                })
              }
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
