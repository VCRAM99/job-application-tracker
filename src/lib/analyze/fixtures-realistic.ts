import type { JobFixture } from "@/lib/analyze/fixtures"

/**
 * Realistic, fictional postings for the extraction eval. Unlike the short fixtures in
 * fixtures.ts, these carry the parts of real postings that are not requirements: about-us copy,
 * responsibilities, benefits, salary, equal-opportunity text, application steps, and repeated
 * requirements. `expected` lists every requirement a candidate is judged on (required and
 * preferred qualifications, plus location and work-authorization rules) and nothing else.
 *
 * TUNING_FIXTURES and TUNING_FIXTURES_ROUND_TWO were used while changing the extraction prompt and
 * filters. HELD_OUT_FIXTURES (fixtures-heldout.ts) were written after the filters were final,
 * committed before any eval run, and scored once.
 */

const quarry = `About Quarry Lane Health
Quarry Lane Health is a fictional clinic network that builds its own scheduling software. Our mission is to make booking care as simple as ordering coffee. We have 40 clinics and a remote-first engineering team of 25.

The role: Senior Backend Engineer, Scheduling
You will own the appointment booking service and the APIs that clinics use every day.

What you'll do
- Design and run the booking APIs in TypeScript on Node.js.
- Partner with product and clinic staff to plan releases.
- Take part in a weekly on-call rotation with clear runbooks.
- Mentor two mid-level engineers.

What you bring
- 5+ years of professional backend development.
- Strong TypeScript and Node.js.
- Experience operating PostgreSQL in production, including query tuning.
- Experience designing REST APIs used by other teams.

Nice to have
- Experience with healthcare data or HIPAA.
- Familiarity with Terraform.

Benefits
- Health, dental, and vision coverage from day one.
- A $1,500 yearly learning budget.
- Four weeks of paid vacation.

Compensation: $150,000 – $175,000 USD per year, plus equity.
Location: remote within the United States. You must be authorized to work in the United States; we cannot sponsor visas for this role.

Quarry Lane Health is an equal opportunity employer. We welcome applicants of every background. If you need an accommodation during the interview process, email our recruiting team.
Strong TypeScript skills are a must for this role.`

const tidewater = `Tidewater Bakery Co. (fictional) — Production Supervisor, Night Shift

Who we are: a family-owned fictional bakery that ships bread to 200 grocery stores. We care about craft, safety, and each other.

In this role you will lead a team of 12 bakers on the night shift, keep the line running, and hand over cleanly to the morning crew. You will track waste, update the production board, and train new hires on safety procedures.

Requirements:
* At least 3 years supervising a food production or manufacturing shift.
* A current food safety certification (for example, ServSafe or equivalent).
* Able to lift 50 pounds and stand for a full shift.
* Available to work nights, 10 p.m. to 6:30 a.m., Sunday through Thursday.

Preferred:
* Bilingual in English and Spanish.
* Experience with a production scheduling system.

What we offer: shift differential, free bread, paid holidays, and a 401(k) match.
Pay: $28–$32 per hour.
This position is onsite at our fictional plant in Tidewater, Oregon.
To apply, send a resume. Tidewater Bakery Co. is fictional and this posting is not an offer of employment.`

const meridian = `Meridian Atlas (fictional) is hiring a Data Engineer to join our Analytics Platform team.

Meridian Atlas builds fictional mapping tools for city planners. Our team moves fast, values kindness, and ships every week.

Responsibilities
• Build and maintain batch and streaming pipelines.
• Model data in our warehouse so analysts can self-serve.
• Work with planners to understand the questions they need answered.

Qualifications
• 3+ years building data pipelines in Python.
• Strong SQL, including window functions.
• Experience with Apache Airflow or a similar orchestrator.
• Experience with a cloud data warehouse such as BigQuery or Snowflake.

Bonus points
• Experience with geospatial data (PostGIS).
• Experience with Kafka.

We know great people don't always meet every requirement. If you have most of these qualifications, please apply.

Perks: hybrid schedule, commuter benefits, and a yearly team retreat.
Location: hybrid, three days a week in our fictional Lisbon office.
Meridian Atlas is fictional. This posting is not an offer of employment.
Again: strong SQL is essential.`

export const TUNING_FIXTURES: JobFixture[] = [
  {
    id: "quarry-backend-realistic",
    title: "Senior Backend Engineer, Scheduling",
    company: "Quarry Lane Health",
    jd: quarry,
    expected: [
      { textIncludes: "5+ years", kind: "required", category: "experience_years" },
      { textIncludes: "typescript", kind: "required", category: "skill" },
      { textIncludes: "postgresql", kind: "required", category: "skill" },
      { textIncludes: "rest apis", kind: "required", category: "skill" },
      { textIncludes: "hipaa", kind: "preferred", category: "domain" },
      { textIncludes: "terraform", kind: "preferred", category: "skill" },
      { textIncludes: "remote within the united states", kind: "required", category: "work_authorization_location" },
      { textIncludes: "authorized to work", kind: "required", category: "work_authorization_location" },
    ],
  },
  {
    id: "tidewater-bakery-realistic",
    title: "Production Supervisor, Night Shift",
    company: "Tidewater Bakery Co.",
    jd: tidewater,
    expected: [
      { textIncludes: "3 years supervising", kind: "required", category: "experience_years" },
      { textIncludes: "food safety certification", kind: "required", category: "certification" },
      { textIncludes: "50 pounds", kind: "required", category: "other" },
      { textIncludes: "nights", kind: "required", category: "other" },
      { textIncludes: "spanish", kind: "preferred", category: "other" },
      { textIncludes: "scheduling system", kind: "preferred", category: "skill" },
      { textIncludes: "onsite", kind: "required", category: "work_authorization_location" },
    ],
  },
  {
    id: "meridian-data-realistic",
    title: "Data Engineer",
    company: "Meridian Atlas",
    jd: meridian,
    expected: [
      { textIncludes: "python", kind: "required", category: "experience_years" },
      { textIncludes: "sql", kind: "required", category: "skill" },
      { textIncludes: "airflow", kind: "required", category: "skill" },
      { textIncludes: "warehouse", kind: "required", category: "skill" },
      { textIncludes: "geospatial", kind: "preferred", category: "domain" },
      { textIncludes: "kafka", kind: "preferred", category: "skill" },
      { textIncludes: "lisbon", kind: "required", category: "work_authorization_location" },
    ],
  },
]

const fernhill = `Fernhill Robotics (fictional) — Embedded Software Engineer

Fernhill Robotics builds fictional warehouse robots that move shelves to pickers. We are a 60-person team backed by fictional investors, and we just opened a second lab.

About the team
The Motion team writes the firmware that keeps our robots moving safely around people.

Your day-to-day
- Write and test motor-control firmware.
- Debug hardware with oscilloscopes and logic analyzers.
- Review designs with the electrical team.

You should have
- A bachelor's degree in electrical engineering, computer engineering, or a related field.
- 4 years of experience writing embedded C or C++ for microcontrollers.
- Experience with a real-time operating system such as FreeRTOS or Zephyr.
- Comfort reading schematics.

It would be great if you have
- Experience with CAN bus.
- Experience with safety standards such as ISO 13849.

Why Fernhill
Competitive salary, stock options, lunch on Fridays, and a robot named after you.
This role is onsite in our fictional lab in Fernhill, Ontario, Canada. Applicants must be legally entitled to work in Canada.
Fernhill Robotics provides accommodations for applicants with disabilities on request.
Fernhill Robotics is fictional; this posting is not an offer of employment.`

const saltmarsh = `Saltmarsh Public Library (fictional) is hiring a Teen Services Librarian (part-time, 24 hours per week).

The library serves a fictional coastal town of 30,000 people and believes everyone deserves free access to information.

Duties
Plan and lead after-school programs for ages 12–18, choose books and games for the teen collection, staff the reference desk, and visit local schools.

Minimum qualifications
A master's degree in library or information science (MLIS) from an ALA-accredited program.
At least 1 year of experience working with teenagers in a library, school, or youth program.

Desired qualifications
Experience running a gaming or makerspace program.
Fluency in Portuguese.

The library offers a pension, paid sick leave, and a flexible schedule. Hourly rate: $31.50.
Work is onsite at the fictional Saltmarsh main branch, including two evenings and one Saturday per month.
A background check is required before the start date.
Saltmarsh Public Library is an equal opportunity employer. Saltmarsh is fictional and this posting is not an offer of employment.`

const cobalt = `Senior Product Manager, Payments — Cobalt Finch (fictional)

Cobalt Finch is a fictional fintech that helps small shops get paid. We process payments for 20,000 merchants and are growing fast. Our values: be candid, be curious, be kind.

What you'll own
You'll own the payments roadmap, work with engineering and design to ship features, talk with merchants every week, and report results to leadership.

What we're looking for
• 6+ years of product management experience.
• At least 2 years managing payments, billing, or other financial products.
• Experience writing clear product requirement documents.
• Comfort with SQL to answer your own questions.

Extra credit
• Experience with card network rules or PCI DSS.
• An MBA.

Benefits include unlimited PTO, a home-office stipend, parental leave, and an annual offsite.
Salary range: €95,000–€115,000.
We're remote-friendly across the European Union; you must be based in an EU country.
Cobalt Finch is fictional. Not an offer of employment.
We're looking for 6+ years of product management experience.`

const juniper = `Juniper Row Veterinary (fictional) — Registered Veterinary Technician

Juniper Row is a fictional small-animal clinic that has cared for cats and dogs since 1998. We are a friendly team of nine.

You will: assist veterinarians in surgery, place catheters, take radiographs, run lab samples, and talk owners through aftercare.

Must have:
- Credentialed as a Registered Veterinary Technician (RVT) in the state of Vermont, or eligible within 90 days of hire.
- 2 years of clinical experience in a small-animal practice.
- Experience with anesthesia monitoring.

Good to have:
- Fear Free certification.
- Experience with dentistry radiographs.

We offer: health insurance, continuing-education days, uniform allowance, and pet care discounts.
Full-time, onsite in fictional Juniper Row, Vermont. Some Saturdays required.
Juniper Row Veterinary is fictional and this posting is not an offer of employment.`

/**
 * These four were first presented as held out, but the boilerplate filter was written in the same
 * session and includes phrases that appear only in them, so they are tuning data. The independent
 * review caught this; HELD_OUT_FIXTURES below are new.
 */
export const TUNING_FIXTURES_ROUND_TWO: JobFixture[] = [
  {
    id: "fernhill-embedded-tuning",
    title: "Embedded Software Engineer",
    company: "Fernhill Robotics",
    jd: fernhill,
    expected: [
      { textIncludes: "bachelor", kind: "required", category: "education" },
      { textIncludes: "embedded c", kind: "required", category: "experience_years" },
      { textIncludes: "real-time operating system", kind: "required", category: "skill" },
      { textIncludes: "schematics", kind: "required", category: "skill" },
      { textIncludes: "can bus", kind: "preferred", category: "skill" },
      { textIncludes: "iso 13849", kind: "preferred", category: "domain" },
      { textIncludes: "onsite", kind: "required", category: "work_authorization_location" },
      { textIncludes: "entitled to work", kind: "required", category: "work_authorization_location" },
    ],
  },
  {
    id: "saltmarsh-librarian-tuning",
    title: "Teen Services Librarian",
    company: "Saltmarsh Public Library",
    jd: saltmarsh,
    expected: [
      { textIncludes: "master", kind: "required", category: "education" },
      { textIncludes: "teenagers", kind: "required", category: "experience_years" },
      { textIncludes: "makerspace", kind: "preferred", category: "other" },
      { textIncludes: "portuguese", kind: "preferred", category: "other" },
      { textIncludes: "onsite", kind: "required", category: "work_authorization_location" },
      { textIncludes: "background check", kind: "required", category: "other" },
    ],
  },
  {
    id: "cobalt-pm-tuning",
    title: "Senior Product Manager, Payments",
    company: "Cobalt Finch",
    jd: cobalt,
    expected: [
      { textIncludes: "6+ years", kind: "required", category: "experience_years" },
      { textIncludes: "payments, billing", kind: "required", category: "experience_years" },
      { textIncludes: "requirement documents", kind: "required", category: "other" },
      { textIncludes: "sql", kind: "required", category: "skill" },
      { textIncludes: "pci", kind: "preferred", category: "domain" },
      { textIncludes: "mba", kind: "preferred", category: "education" },
      { textIncludes: "eu country", kind: "required", category: "work_authorization_location" },
    ],
  },
  {
    id: "juniper-vettech-tuning",
    title: "Registered Veterinary Technician",
    company: "Juniper Row Veterinary",
    jd: juniper,
    expected: [
      { textIncludes: "registered veterinary technician", kind: "required", category: "certification" },
      { textIncludes: "2 years of clinical", kind: "required", category: "experience_years" },
      { textIncludes: "anesthesia", kind: "required", category: "skill" },
      { textIncludes: "fear free", kind: "preferred", category: "certification" },
      { textIncludes: "dentistry", kind: "preferred", category: "skill" },
      { textIncludes: "onsite", kind: "required", category: "work_authorization_location" },
    ],
  },
]
