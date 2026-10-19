export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" opacity="0.08" />
      <rect x="1" y="1" width="30" height="30" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <rect x="7" y="18" width="4.5" height="7" rx="1" fill="currentColor" />
      <rect x="13.75" y="13" width="4.5" height="12" rx="1" fill="currentColor" />
      <rect x="20.5" y="8" width="4.5" height="17" rx="1" fill="currentColor" />
    </svg>
  )
}
