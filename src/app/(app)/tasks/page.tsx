import type { Metadata } from "next"

import { PlaceholderPage } from "@/components/placeholder-page"

export const metadata: Metadata = { title: "Tasks" }

export default function TasksPage() {
  return (
    <PlaceholderPage
      title="Tasks"
      description="The next action for each company, application, or conversation will be listed here."
      emptyTitle="No tasks yet"
      emptyDescription="Task tracking is planned. Nothing is saved from this screen."
    />
  )
}
