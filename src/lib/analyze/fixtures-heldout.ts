import type { JobFixture } from "@/lib/analyze/fixtures"

/**
 * Held-out extraction fixtures (fictional). Written after the extraction prompt and filters were
 * final and committed before any eval run on them, so no change was chosen by looking at them.
 * Same labeling rule as fixtures-realistic.ts: every requirement a candidate is judged on, and
 * nothing else.
 */

const larkspur = `Larkspur Transit Authority (fictional)
Position: GIS Analyst II
Department: Planning & Service Development | Req #: LTA-2026-133

About the Authority
Larkspur Transit runs fictional bus and light-rail service for a region of 1.2 million riders. We're committed to sustainability and to reflecting the communities we serve.

Summary of duties
Maintain the stop and route database, produce ridership maps for board meetings, support service-change analysis, and answer data requests from other departments.

Minimum requirements
Bachelor's degree in geography, urban planning, GIS, or a closely related field.
Two years of professional GIS experience.
Proficiency with ArcGIS Pro.

Preferred
Experience with Python scripting for geoprocessing.
Familiarity with GTFS transit data.

Conditions of employment: a valid driver's license is required. This position is located at our fictional downtown Larkspur headquarters and is not eligible for remote work.

Salary: $68,400 - $81,200 annually. The Authority offers a defined-benefit pension, transit pass, and generous leave.
Larkspur Transit Authority is an Equal Opportunity Employer. Larkspur is fictional; this is not an offer of employment.`

const cinder = `Cinder & Slate (fictional) — Frontend Engineer (Contract, 6 months)

We are a small fictional agency building websites for museums and galleries. Our team of eight works across three time zones.

The project
You'll help rebuild a museum's collection site: accessible browse pages, a fast image viewer, and a design system the client's team can maintain after we leave.

You'll need
- 3+ years building production web apps with React.
- Solid understanding of accessibility (WCAG 2.2 AA) and semantic HTML.
- Experience with TypeScript.
- Strong written English for async collaboration.

Bonus
- You've worked with a headless CMS (Sanity, Contentful, or similar).
- Experience with IIIF image servers.

Rate: €70–€85 per hour, invoiced monthly. Fully remote; you need at least four hours of overlap with Central European Time.
Contract role; candidates must be able to invoice as a freelancer or through their own company.
Cinder & Slate is fictional and this posting is not an offer of employment.`

const marrow = `Clinical Research Coordinator — Marrowfield Children's Hospital (fictional)

Marrowfield Children's Hospital is a fictional 180-bed pediatric hospital. Every day, our teams put kids and families first.

Position overview
The coordinator manages day-to-day operations for two oncology trials: screening and consenting families, scheduling study visits, collecting and entering data, and preparing for monitoring visits.

Qualifications
• Bachelor's degree in a health or science field.
• At least 1 year of clinical research experience.
• Working knowledge of Good Clinical Practice (GCP); current GCP certificate within 30 days of hire.
• Comfortable drawing and processing lab samples, or willing to be trained.

Preferred qualifications
• SOCRA or ACRP certification.
• Experience with REDCap.
• Experience working with children and families.

Schedule: full-time, Monday–Friday, onsite at the fictional Marrowfield campus. Occasional early mornings for study visits.
Employment is contingent on a background check and proof of immunizations.
Marrowfield offers tuition assistance, medical and dental coverage, and a retirement plan with employer match.
Marrowfield Children's Hospital is fictional. This is not an offer of employment.`

const thistle = `Thistle Freight Systems (fictional) is hiring a Warehouse Operations Lead in our fictional Reno, Nevada distribution center.

Who we are: a fictional third-party logistics company that moves outdoor gear for 40 brands.

What you'll own
Running the inbound dock on second shift, coaching a crew of 15, hitting daily receiving targets, and keeping the floor safe.

Must-haves
- 2+ years leading a team in a warehouse or distribution center.
- Experience with a warehouse management system (Manhattan, Blue Yonder, or similar).
- Forklift certification, or the ability to get certified in your first 30 days.
- Able to work second shift (2:30 p.m. – 11 p.m.), Monday through Friday.

Nice-to-haves
- Lean or Six Sigma training.
- Bilingual English/Spanish.

Pay starts at $26.50/hour plus a $2 shift differential. Benefits include medical, 401(k) with match, and paid time off.
Thistle Freight Systems is fictional; this posting is not an offer of employment.
Reminder: you must be able to work second shift.`

export const HELD_OUT_FIXTURES: JobFixture[] = [
  {
    id: "larkspur-gis-heldout",
    title: "GIS Analyst II",
    company: "Larkspur Transit Authority",
    jd: larkspur,
    expected: [
      { textIncludes: "bachelor", kind: "required", category: "education" },
      { textIncludes: "two years of professional gis", kind: "required", category: "experience_years" },
      { textIncludes: "arcgis pro", kind: "required", category: "skill" },
      { textIncludes: "python", kind: "preferred", category: "skill" },
      { textIncludes: "gtfs", kind: "preferred", category: "domain" },
      { textIncludes: "driver's license", kind: "required", category: "other" },
      { textIncludes: "not eligible for remote", kind: "required", category: "work_authorization_location" },
    ],
  },
  {
    id: "cinder-frontend-heldout",
    title: "Frontend Engineer (Contract)",
    company: "Cinder & Slate",
    jd: cinder,
    expected: [
      { textIncludes: "react", kind: "required", category: "experience_years" },
      { textIncludes: "accessibility", kind: "required", category: "skill" },
      { textIncludes: "typescript", kind: "required", category: "skill" },
      { textIncludes: "written english", kind: "required", category: "other" },
      { textIncludes: "headless cms", kind: "preferred", category: "skill" },
      { textIncludes: "iiif", kind: "preferred", category: "skill" },
      { textIncludes: "central european time", kind: "required", category: "work_authorization_location" },
      { textIncludes: "invoice", kind: "required", category: "other" },
    ],
  },
  {
    id: "marrowfield-crc-heldout",
    title: "Clinical Research Coordinator",
    company: "Marrowfield Children's Hospital",
    jd: marrow,
    expected: [
      { textIncludes: "bachelor", kind: "required", category: "education" },
      { textIncludes: "clinical research experience", kind: "required", category: "experience_years" },
      { textIncludes: "good clinical practice", kind: "required", category: "certification" },
      { textIncludes: "lab samples", kind: "required", category: "skill" },
      { textIncludes: "socra", kind: "preferred", category: "certification" },
      { textIncludes: "redcap", kind: "preferred", category: "skill" },
      { textIncludes: "children and families", kind: "preferred", category: "other" },
      { textIncludes: "onsite", kind: "required", category: "work_authorization_location" },
      { textIncludes: "background check", kind: "required", category: "other" },
    ],
  },
  {
    id: "thistle-warehouse-heldout",
    title: "Warehouse Operations Lead",
    company: "Thistle Freight Systems",
    jd: thistle,
    expected: [
      { textIncludes: "leading a team", kind: "required", category: "experience_years" },
      { textIncludes: "warehouse management system", kind: "required", category: "skill" },
      { textIncludes: "forklift", kind: "required", category: "certification" },
      { textIncludes: "second shift", kind: "required", category: "other" },
      { textIncludes: "six sigma", kind: "preferred", category: "certification" },
      { textIncludes: "spanish", kind: "preferred", category: "other" },
      { textIncludes: "reno", kind: "required", category: "work_authorization_location" },
    ],
  },
]
