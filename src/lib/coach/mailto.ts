/** Mail clients and browsers cut long mailto URLs; above this the page offers Copy only. */
export const MAILTO_MAX = 2000

const EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

/**
 * A prefilled mailto: link (RFC 6068). The address must be a plain address
 * with no query characters; subject and body are percent-encoded with CRLF
 * line breaks. Returns null when there is no usable address or it is too long.
 */
export function buildMailto(email: string | null | undefined, subject: string | null, body: string): string | null {
  const address = (email ?? "").trim()
  if (!EMAIL.test(address) || address.length > 254) return null
  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject.replace(/[\r\n]+/g, " "))}`)
  params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`)
  const url = `mailto:${address}?${params.join("&")}`
  return url.length <= MAILTO_MAX ? url : null
}
