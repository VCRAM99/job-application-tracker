export const ADA_RESUME = `Ada Lovelace
Software engineer

Northwind Analytics, Software Engineer, 2022-03-01 to present
Built a TypeScript import pipeline used by the research team.

University of Example, BSc Computer Science, 2018-09-01 to 2022-05-01

Skills: TypeScript, PostgreSQL

Project: Harbor Notes. A personal note app.

Accomplishment: Reduced report generation from 12 minutes to 2 minutes.

Certification: Example Cloud Practitioner, issued 2023-06-01 by Example Cloud.
`

export const ADA_EXTRACTION = {
  employment: [
    {
      organization: "Northwind Analytics",
      title: "Software Engineer",
      location: null,
      startDate: "2022-03-01",
      endDate: null,
      current: true,
      summary: "Built a TypeScript import pipeline used by the research team.",
      evidence: "Northwind Analytics, Software Engineer, 2022-03-01 to present",
    },
  ],
  education: [
    {
      institution: "University of Example",
      credential: "BSc Computer Science",
      fieldOfStudy: null,
      startDate: "2018-09-01",
      endDate: "2022-05-01",
      summary: null,
      evidence: "University of Example, BSc Computer Science, 2018-09-01 to 2022-05-01",
    },
  ],
  skills: [
    { name: "TypeScript", category: null, evidence: "Skills: TypeScript, PostgreSQL" },
    { name: "PostgreSQL", category: null, evidence: "Skills: TypeScript, PostgreSQL" },
  ],
  projects: [
    {
      name: "Harbor Notes",
      roleTitle: null,
      url: null,
      summary: "A personal note app.",
      evidence: "Project: Harbor Notes. A personal note app.",
    },
  ],
  accomplishments: [
    {
      title: "Reduced report generation from 12 minutes to 2 minutes.",
      summary: null,
      evidence: "Reduced report generation from 12 minutes to 2 minutes.",
    },
  ],
  certifications: [
    {
      name: "Example Cloud Practitioner",
      issuer: "Example Cloud",
      issuedOn: "2023-06-01",
      expiresOn: null,
      credentialUrl: null,
      evidence: "Certification: Example Cloud Practitioner, issued 2023-06-01 by Example Cloud.",
    },
  ],
}
