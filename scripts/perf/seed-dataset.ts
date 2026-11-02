/**
 * LOCAL ONLY. Seeds a realistic dataset for performance measurement on the
 * local Supabase stack: one perf user with 100 companies, 300 applications,
 * 200 contacts, 150 tasks, 60 preparation items, verified facts, and a
 * 500-posting synthetic catalog source. Fictional data only.
 *
 *   npx tsx --conditions=react-server scripts/perf/seed-dataset.ts
 *
 * Refuses anything but the local stack (see e2e/support/local-env.ts).
 * The generated password goes to e2e/.state/perf-user.json and is never printed.
 */
import { connectLocal, loadCatalog, recreateUsers, seedAiProfile, writeState } from "../../e2e/support/seed"

export const PERF_EMAIL = "perf-user@example.test"

const STATUSES = ["saved", "applied", "applied", "applied", "recruiter_screen", "technical_interview", "final_interview", "offer", "rejected", "withdrawn"]
const ROLES = ["Backend Engineer", "Platform Engineer", "Data Engineer", "Site Reliability Engineer", "Staff Engineer", "Engineering Manager"]
const CITIES = ["Toronto, Canada", "Montreal, Canada", "Vancouver, Canada", "Austin, United States", "Remote, Canada", "New York, United States"]

function day(offset: number) {
  const date = new Date(Date.UTC(2026, 10, 2) - offset * 86_400_000)
  return date.toISOString().slice(0, 10)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function catalogFixture(count: number) {
  return {
    jobs: Array.from({ length: count }, (_, index) => ({
      id: 900_000 + index,
      internal_job_id: 800_000 + index,
      title: `${index % 3 === 0 ? "Senior " : ""}${ROLES[index % ROLES.length]}`,
      updated_at: `2026-10-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      requisition_id: `PERF-${index}`,
      location: { name: CITIES[index % CITIES.length] },
      absolute_url: `https://boards.greenhouse.io/perf-fixtures/jobs/${900_000 + index}`,
      company_name: "Northwind",
      content: `<p>Build services with ${index % 2 ? "TypeScript" : "Go"} and PostgreSQL. Posting ${index}.</p>`,
      metadata: null,
    })),
  }
}

async function main() {
  const local = await connectLocal()
  const user = await recreateUsers(local, [PERF_EMAIL])
  await seedAiProfile(local, user)
  const { call } = local
  const token = user.token

  const companies = (await call("/rest/v1/companies?select=id", {
    method: "POST",
    token,
    body: Array.from({ length: 100 }, (_, index) => ({
      name: `Perf Company ${String(index + 1).padStart(3, "0")}`,
      industry: index % 2 ? "Software" : "Health analytics",
      location: CITIES[index % CITIES.length],
      priority_tier: ["A", "B", "C", "unset"][index % 4],
      follow_up_date: index % 5 === 0 ? day(index % 20) : null,
    })),
  })) as Array<{ id: string }>

  const applications: Array<{ id: string }> = []
  for (const batch of chunks(Array.from({ length: 300 }, (_, index) => index), 100)) {
    const rows = (await call("/rest/v1/applications?select=id", {
      method: "POST",
      token,
      body: batch.map((index) => ({
        company_id: companies[index % companies.length]!.id,
        job_title: `${ROLES[index % ROLES.length]} ${index + 1}`,
        status: STATUSES[index % STATUSES.length],
        applied_at: index % 10 === 0 ? null : day(index % 120),
        next_follow_up_date: index % 7 === 0 ? day((index % 30) - 15) : null,
        location: CITIES[index % CITIES.length],
        notes: `Perf application ${index + 1}.`,
      })),
    })) as Array<{ id: string }>
    applications.push(...rows)
  }

  for (const batch of chunks(Array.from({ length: 200 }, (_, index) => index), 100)) {
    await call("/rest/v1/contacts", {
      method: "POST",
      token,
      prefer: "return=minimal",
      body: batch.map((index) => ({
        name: `Perf Contact ${index + 1}`,
        role_title: index % 2 ? "Recruiter" : "Engineering Manager",
        organization: `Perf Company ${String((index % 100) + 1).padStart(3, "0")}`,
        relationship_type: index % 2 ? "recruiter" : "hiring_manager",
        company_id: companies[index % companies.length]!.id,
        application_id: index % 3 === 0 ? applications[index % applications.length]!.id : null,
        next_follow_up_date: index % 4 === 0 ? day((index % 20) - 10) : null,
      })),
    })
  }

  await call("/rest/v1/tasks", {
    method: "POST",
    token,
    prefer: "return=minimal",
    body: Array.from({ length: 150 }, (_, index) => ({
      title: `Perf task ${index + 1}`,
      status: ["todo", "in_progress", "done"][index % 3],
      completed_at: index % 3 === 2 ? day(index % 10) : null,
      priority: ["low", "medium", "high"][index % 3],
      due_date: day((index % 40) - 20),
      application_id: index % 2 ? applications[index % applications.length]!.id : null,
    })),
  })

  await call("/rest/v1/preparation_items", {
    method: "POST",
    token,
    prefer: "return=minimal",
    body: Array.from({ length: 60 }, (_, index) => ({
      title: `Perf preparation ${index + 1}`,
      category: ["coding", "system_design", "behavioral", "other"][index % 4],
      status: ["not_started", "in_progress", "completed"][index % 3],
      completed_at: index % 3 === 2 ? day(index % 10) : null,
    })),
  })

  await loadCatalog(local, "perf-fixtures", catalogFixture(500))
  writeState("perf-user.json", { email: PERF_EMAIL, password: user.password, id: user.id })
  console.log("perf dataset: 100 companies, 300 applications, 200 contacts, 150 tasks, 60 preparation items, 500 catalog postings.")
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "perf seed failed")
    process.exit(1)
  })
}
