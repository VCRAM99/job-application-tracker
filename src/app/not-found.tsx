import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          That address is not part of the tracker.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Go to the app
        </Link>
      </div>
    </div>
  )
}
