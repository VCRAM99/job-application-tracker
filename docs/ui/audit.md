# UI audit (M6b, before)

Screenshots are in [`docs/ui/before/`](before/). They show a production build with the perf dataset (300 applications, 200 contacts, 500 postings), every V2 flag on, and the fake AI provider. Captures: dark desktop for every page; light desktop and 390px mobile for key pages; empty, validation-error, and dialog states.

## Across the app

| Problem | Where | Proposed change |
|---|---|---|
| Every page header carries an explanatory paragraph. The dashboard's is 273 characters, and 26 of 44 headers have a static sentence. | `PageHeader` everywhere | Move the explanation into a HelpTip next to the title. Keep a visible one-line subtitle only for context (company, counts, contact) or must-see notes. |
| Section intros repeat the page rules in body text. | career (5 sections), settings (6), analyze result, daily tasks | Move them into HelpTips on the section titles. Keep a visible line only where the must-see list requires it. |
| No secondary-action pattern. Headers show every action as a button, with Delete in red next to Edit. | application, company, contact, task, preparation detail; analyze result; resume version | One primary action plus a ⋯ menu for the rest. Delete moves into the menu and still opens its confirmation dialog. |
| Navigation is a flat list of 12 items with no grouping. | sidebar, mobile sheet | Group into Track, Discover, Prepare, and You. Hide empty groups when flags are off, and keep the current-page state. |
| Section headers differ: dashboard `Section`, coach `Section`, resume `Section`, and plain `h2`s with different sizes and spacing. | many | One `SectionHeader` (title, optional HelpTip, optional action) and one card surface. |
| Empty states use a heading, a paragraph, and a button, but the copy is two sentences. | lists | A short line plus one action, with the extra sentence in a HelpTip. |
| Sign out appears twice on desktop (sidebar and Settings) and the user email shows in the sidebar. | shell, settings | Keep both. They are the same action in two expected places, and nothing is lost. The sidebar footer gets tighter. |

## Pages

| Page | Redundant controls | Walls of text | Noise and inconsistency | Proposed change |
|---|---|---|---|---|
| Dashboard | Each follow-up card shows 3 buttons (Create task, Draft message, Dismiss) × 8 | 273-character header | 6 big stat tiles, then 7 equal-weight cards | Header text into a HelpTip on "Dashboard". Follow-ups show Create task, with Draft message and Dismiss in ⋯. Tighter stat tiles. |
| Companies, company detail | Header: Edit, Add application, and Delete company side by side | header sentence | — | HelpTip. Detail keeps Add application as primary, with Edit and Delete in ⋯. |
| Applications list | Import / export and Add application | header sentence | Filters take a full row before the table | HelpTip, Add application primary, Import / export as a secondary button. |
| Application detail | Header: Analyze fit, Tailor resume, Edit, Delete application. Coach row: Prep, Research, Draft. The status form and the details list both show the status. | — | Two button rows | Edit is primary. Analyze fit, Tailor resume, and Delete go in ⋯. The coach row stays (those are entry points), as does the status form (the details value updates with it). |
| Application form, import | — | 180-character import header and the accepted-values intro | — | HelpTips. The accepted-values table stays visible because it is required information. |
| Networking, contact detail | Contact header: Draft, Edit, Delete | header sentence ("Nothing here sends…") | — | HelpTip. Draft is primary, with Edit and Delete in ⋯. |
| Tasks, Preparation, details and forms | Detail header: Edit and Delete | header and form sentences | — | HelpTips. Edit is primary, with Delete in ⋯. |
| Daily tasks | — | page, form, and weekly-insights paragraphs | Long weekly-insights paragraph | HelpTips on the title and the Weekly Insights heading. |
| Settings | — | a sentence under every section, plus two under AI | Six equal cards | Section text into HelpTips. Billing mode, the "unverified" key status, and the managed-allowance line stay visible. |
| Auth pages | — | short | fine | Light copy trim only. |
| Jobs | Each card has 10 buttons: Details, Apply, Add to tracker, Save, Hide, Not interested, Already applied, Prefer company, Exclude company, and sometimes Clear feedback. The "Why this estimate" list is always open. | header sentence and external-search paragraph | 500 × 10 buttons. Filters fill the first screen. | Cards keep Apply, Add to tracker, Save, and Hide (with Details on the title link and the button). Not interested, Already applied, Prefer company, Exclude company, and Clear feedback go in ⋯. "Why this estimate" folds into a disclosure. Advanced filters fold into a "More filters" disclosure. The "Match estimate … Not an interview prediction" line stays visible. |
| Job alerts | — | header sentence | — | HelpTip. |
| Analyze (form) | — | header sentence | — | HelpTip. The billing mode stays visible. |
| Analyze result | Header: Tailor resume, Prepare for interview, All analyses | Three sentences under the score. Separate checks, gaps, and readability intros. | — | Prepare for interview is primary, with Tailor resume and All analyses in ⋯. Score explanation into a HelpTip on the score title. "Qualification match estimate" and the not-an-ATS note stay visible. Section intros into HelpTips. |
| Resumes, detail, tailor, version | Version header: DOCX, PDF, ⋯ | header sentence | — | HelpTip. "AI-proposed · unverified" and "Not an ATS score." stay visible. |
| Career | — | Header, plus a sentence under each of the five sections | Long single column | Header and section text into HelpTips. Suggested and verified labels stay visible. |
| Coach: prep set, story bank, practice, research, drafts, answers, follow-ups | Draft page: Copy, Mark as sent, Regenerate, ⋯, and Back in the header | headers | "Back" sits far from the content | HelpTips. Mark as sent is primary, with Copy and Regenerate beside it and the rest in ⋯. "AI draft", "Not sent", billing mode, and "From your sources only" stay visible. |

## Must stay visible (never tooltip-only)

- "Qualification match estimate" and its not-an-ATS / not-an-interview-prediction disclaimers (analyze result, job cards, resume readability).
- "AI draft", "Not sent", "Marked sent", "AI-parsed · unverified", "AI-proposed · unverified", and the suggested and verified labels on Career.
- Billing mode (Your key or Managed) next to every AI action, and the provider · model · mode line on AI output.
- Destructive-action confirmation dialogs.
- Form validation errors and form status messages.
- The research "From your sources only" note.
