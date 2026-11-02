/** Placeholder for a section that streams in after the page's main content. */
export function SectionSkeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-3 rounded bg-muted/70 motion-safe:animate-pulse" style={{ width: `${90 - index * 15}%` }} />
      ))}
    </div>
  )
}
