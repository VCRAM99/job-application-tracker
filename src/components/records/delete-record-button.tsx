"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function DeleteRecordButton({
  action,
  id,
  title,
  description,
  label,
  returnTo,
}: {
  action: (formData: FormData) => Promise<void>
  id: string
  title: string
  description: string
  label: string
  returnTo?: string
}) {
  const [pending, setPending] = useState(false)

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <form
            action={async (formData) => {
              setPending(true)
              await action(formData)
            }}
          >
            <input type="hidden" name="id" value={id} />
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : label}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
