"use client"

import { cn } from "cn"
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
  fields,
  className,
}: {
  action: (formData: FormData) => Promise<void>
  id: string
  title: string
  description: string
  label: string
  returnTo?: string
  fields?: Record<string, string>
  className?: string
}) {
  const [pending, setPending] = useState(false)

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" size="sm" className={cn("pressable", className)} />}>{label}</DialogTrigger>
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
            {fields ? Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
            <Button type="submit" variant="destructive" className="pressable" disabled={pending}>
              {pending ? "Deleting…" : label}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
