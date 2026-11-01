import { RecordState } from "@/components/records/fields"

export function ResumeStudioOff() {
  return (
    <RecordState
      title="Resume Studio is off"
      description="Set RESUME_STUDIO_ENABLED=true and AI_FEATURES_ENABLED=true on the server. Existing tracking is unchanged."
    />
  )
}
