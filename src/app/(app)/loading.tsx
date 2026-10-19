export default function ProtectedLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-40 rounded-md bg-muted" />
      <div className="h-4 w-72 max-w-full rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="surface h-20" />
        ))}
      </div>
    </div>
  )
}