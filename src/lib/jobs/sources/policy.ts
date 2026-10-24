export type SourceActivation = {
  provider: string
  accessMethod: string
  approvedUsage: string
  attributionRequirements: string
  retentionRestrictions: string
  allowedStorageFields: string[]
  refreshLimitPerDay: number
  approvalStatus: "draft" | "approved" | "revoked"
  termsStatus: "unclear" | "permitted" | "restricted"
  liveIngestionEnabled: boolean
  sourceIdentifier: string | null
}

export function ingestionAllowed(
  source: SourceActivation,
  flags: { ingestion: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (!flags.ingestion) return { ok: false, reason: "ingestion_disabled" }
  if (!source.liveIngestionEnabled) return { ok: false, reason: "source_not_activated" }
  if (source.approvalStatus !== "approved") return { ok: false, reason: "source_not_approved" }
  if (source.termsStatus !== "permitted") return { ok: false, reason: "terms_not_permitted" }
  if (!source.sourceIdentifier) return { ok: false, reason: "missing_identifier" }
  if (source.refreshLimitPerDay <= 0) return { ok: false, reason: "refresh_limit" }
  if (
    !source.accessMethod.trim() ||
    !source.approvedUsage.trim() ||
    !source.attributionRequirements.trim() ||
    !source.retentionRestrictions.trim() ||
    source.allowedStorageFields.length === 0
  ) {
    return { ok: false, reason: "activation_record_incomplete" }
  }
  return { ok: true }
}
