"use client"

import { cn } from "cn"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { moreActionsItemClass, useMoreActionsTrigger } from "@/components/ui/more-actions"
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
  asMenuItem = false,
}: {
  action: (formData: FormData) => Promise<void>
  id: string
  title: string
  description: string
  label: string
  returnTo?: string
  fields?: Record<string, string>
  className?: string
  /** Render the trigger as an item in a ⋯ menu. The confirmation dialog is the same. */
  asMenuItem?: boolean
}) {
  const [pending, setPending] = useState(false)
  // From a ⋯ menu, the item is hidden once chosen, so focus goes back to the ⋯ button on close.
  const menuTrigger = useMoreActionsTrigger()

  return (
    <Dialog>
      <DialogTrigger
        render={
          asMenuItem ? (
            <button type="button" className={cn(moreActionsItemClass, "text-destructive", className)} />
          ) : (
            <Button variant="destructive" size="sm" className={cn("pressable", className)} />
          )
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent finalFocus={asMenuItem && menuTrigger ? menuTrigger : undefined}>
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
