import { AiSettingsForm } from "@/components/career/forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { aiFeaturesEnabled, managedAllowance, platformKeyConfigured } from "@/lib/ai/flags"
import { credentialConfigError } from "@/lib/ai/crypto"
import { revokeProviderCredential, saveAiSettings, saveProviderCredential } from "@/lib/career/actions"
import { loadCareer } from "@/lib/career/data"

export async function AiSettingsSection() {
  if (!aiFeaturesEnabled()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>Career AI is off until AI_FEATURES_ENABLED is set on the server.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const loaded = await loadCareer()
  if (loaded.state === "missing_table") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>
            AI settings appear after the career knowledge migration is applied. Job tracking still works.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (loaded.state !== "ready") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>AI settings could not be loaded.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const allowance = managedAllowance()
  const provider = loaded.workspace.settings.provider
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI</CardTitle>
        <CardDescription>
          Choose managed AI or your own key. A saved key stays unverified until a later explicit check.
          Saving a key does not connect a provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiSettingsForm
          action={saveAiSettings}
          credentialAction={saveProviderCredential}
          revoke={revokeProviderCredential}
          settings={loaded.workspace.settings}
          credentials={loaded.workspace.credentials}
          usage={loaded.workspace.usage}
          encryptionError={credentialConfigError()}
          managedReady={
            allowance.enabled && provider !== null && platformKeyConfigured(provider)
          }
        />
      </CardContent>
    </Card>
  )
}

