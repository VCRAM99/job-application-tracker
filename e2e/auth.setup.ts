import { test as setup } from "@playwright/test"

import { e2eUser, signIn } from "./support/user"

setup("sign in the e2e user", async ({ page }) => {
  const user = e2eUser()
  await signIn(page, user.email, user.password)
  await page.context().storageState({ path: "e2e/.state/storage.json" })
})
