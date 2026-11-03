import "server-only"

import { createClient } from "@supabase/supabase-js"

import { jobOperationProof, type JobOperation } from "@/lib/jobs/proof"

export const CATALOG_FUNCTIONS: Record<JobOperation, string> = {
  "apply-catalog": "apply_job_catalog",
  "register-source": "register_job_source",
  "approve-source": "approve_job_source",
  "record-source-failure": "record_job_source_failure",
  "record-alerts": "record_job_alerts",
  "collect-alerts": "collect_alert_workspace",
  "list-ingestion-sources": "list_job_ingestion_sources",
  "source-status": "job_source_status",
}

export type CatalogRpcResult = { data: unknown; error: { message: string; code?: string } | null }

/** Signs the exact payload string and calls the matching HMAC-gated function. */
export type CatalogCaller = (operation: JobOperation, payload: string) => Promise<CatalogRpcResult>

type RpcClient = {
  rpc: (fn: string, args: { p_payload: string; p_proof: string }) => PromiseLike<CatalogRpcResult>
}

export function catalogCaller(client: RpcClient, secret: string): CatalogCaller {
  return async (operation, payload) => {
    const result = await client.rpc(CATALOG_FUNCTIONS[operation], {
      p_payload: payload,
      p_proof: jobOperationProof(secret, operation, payload),
    })
    return { data: result.data, error: result.error ? { message: result.error.message, code: result.error.code } : null }
  }
}

/**
 * A session-less client with the publishable key. The catalog functions run as
 * security definer and check the HMAC, so no service-role key is needed.
 */
export function publishableClient(url: string, key: string): RpcClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as RpcClient
}
