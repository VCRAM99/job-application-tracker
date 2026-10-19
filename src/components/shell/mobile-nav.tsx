"use client"

import { Menu } from "lucide-react"
import { useState } from "react"

import { signOut } from "@/lib/auth/actions"
import { NavLinks } from "@/components/shell/nav-links"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open menu" />}
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle>Job Tracker</SheetTitle>
        </SheetHeader>
        <div className="px-3 py-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <form action={signOut} className="mt-auto border-t p-3">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
