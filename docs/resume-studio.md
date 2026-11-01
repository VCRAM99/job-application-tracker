# AI Resume Studio

Upload a resume, parse it into sections, tailor it to a completed fit analysis, review each proposed edit, and export the result. The model proposes and the app verifies: anything that fails a check is dropped and counted, never shown as a suggestion. Only `user_verified` career facts count as evidence, and nothing here creates a verified fact. The original upload is never modified.

## Flags and environment

| Variable | Default | What it controls |
| --- | --- | --- |
| `RESUME_STUDIO_ENABLED` | Off. Only the exact value `true` turns it on, and only while `AI_FEATURES_ENABLED` is on. | `/resumes`, its actions, the export route, the nav item, and the "Tailor resume" links. |
| `JOB_ANALYSIS_ENABLED` | Off. | Tailoring needs a completed fit analysis, so tailoring and its links also need this. Upload, parse, and export do not. |
| `JOB_ANALYSIS_GOOGLE_MODEL`, `JOB_ANALYSIS_ANTHROPIC_MODEL`, `JOB_ANALYSIS_OPENAI_MODEL` | The fast models in `src/lib/analyze/constants.ts`. | The model for parsing and tailoring, per provider. |
| `AI_CREDENTIALS_KEY`, `AI_ACCOUNTING_SECRET` | Unset. | Same as career AI: BYOK key encryption and usage reservations. |

The provider and execution mode (your key or managed) come from AI settings. Both AI actions show the billing mode next to the button.

## Storage

Bucket `resumes` is private, has a 5 MB file size limit, and accepts only `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Object keys are exactly `<auth.uid()>/<uuid>.pdf` or `.docx`. `storage.objects` policies let a signed-in user insert, read, and delete only those keys under their own id. There is no update policy, so an upload cannot be overwritten. `anon` has no access.

The browser uploads straight to Storage with the user's session, because Vercel limits a function request body to 4.5 MB. `registerResume` then checks the path belongs to the caller, downloads the object, and checks it again: the type comes from magic bytes (`%PDF-` at byte 0, or a zip with `word/document.xml`), the extension must agree, macro-enabled DOCX is refused, and the DOCX parts we read may not expand past 20 MB. A rejected upload is removed.

Deleting a resume deletes its row and its file. Tailored versions keep their own content and lose only the link, because a version attached to an application is the record of what was sent.

## Pipeline

**Extraction** is deterministic and runs on the server.

- DOCX: `fflate` (MIT) unzips only `[Content_Types].xml` and `word/document.xml`; a small reader turns `w:p`, `w:t`, `w:tab`, and `w:br` into lines and skips deleted text. `mammoth` was not used because it is BSD-2 and the brief asked for MIT or Apache.
- PDF: `unpdf` (MIT, pdf.js under Apache-2.0, built for serverless). A PDF with fewer than 200 non-space characters is treated as scanned and refused. There is no OCR.
- Text is normalized and capped at 80,000 characters, the career source limit. "Save as career source" in the ⋯ menu sends it through `createCareerSource`, so facts still start as suggestions.

**Parsing** returns contact, summary, experience, education, skills, projects, and other sections as schema-only JSON through `generateStructured`: one reservation keyed by user, file hash, prompt version, mode, provider, and model, one JSON repair, and a retry on retryable provider errors. `groundResume` keeps only text found in the extracted resume (case, whitespace, quotes, and dashes folded, as in M3's grounding). An entry whose title, company, credential, institution, project name, or heading is missing is dropped with its bullets; an ungrounded date, location, or contact field becomes empty; a skill must match a whole token, so "Go" is not grounded by "Google". Every drop is counted. The result is cached on the resume row by prompt version. Contact details are used only for the template and are never logged.

**Tailoring** sends the parsed resume (with paths), the analysis requirements and their statuses, and the user's verified facts (id, type, text) inside `<tailor_input>` tags as data. The model returns only an edit list: `rewrite_bullet`, `reorder_bullets`, `add_skill`, `remove_item`, `edit_summary`, each with a target path, before, after, order, rationale, and fact ids. `validateEdits` keeps an edit only when every check passes:

| Check | Drop reason |
| --- | --- |
| The target path exists and fits the operation | `bad_target` |
| `before` equals the current text exactly | `before_mismatch` |
| A rewrite, summary edit, or added skill cites at least one known `user_verified` fact id; unknown ids are removed first | `no_evidence` |
| Every number, percentage, currency amount, magnitude, duration, year, or month in `after` appears in `before` or a cited fact. Values are compared by kind and value, so `$2M` and `$2 million` match, `3` and `three` match, `40%` → `45%` and `$2M` → `€2M` do not | `new_number` |
| No new capitalized name (employer, product, school) after the first word | `new_name` |
| No new title word (senior, staff, principal, lead, manager, director, head, chief, VP, architect, founder, CTO, CEO) | `new_title` |
| No new degree, certificate, or license word | `new_credential` |
| `add_skill` names an existing `user_verified` skill fact that is cited, and the skill is not already listed | `skill_not_verified`, `skill_present` |
| Bullets 20–300 characters, summary 20–600, skill up to 60 | `length` |
| A reorder is a true permutation of the original indexes | `bad_order` |
| One edit per target | `conflict` |
| At most 20 edits per run | `edit_cap` |
| The edit changes something | `no_change` |

A version stores the base, the kept edits (all `pending`), and dropped counts. Accept, reject, and accept all recompute `final_content` on the server: rewrites and removals apply by original index, then a reorder. M3's readability heuristics run on the base and on the final content and show side by side, labeled as not an ATS score.

## Export

`/api/resumes/versions/[id]/export?format=docx|pdf` builds one clean single-column template from the version's final content, so only accepted edits appear: name, contact line, then Summary, Experience, Education, Skills, Projects, and other sections, with plain headings and bullets and no tables, columns, images, or text boxes. DOCX uses the `docx` package and PDF uses `@react-pdf/renderer`; there is no headless browser. Document dates are pinned to the version's last update, so the same content gives the same bytes. The file name comes from the person and the version label, with an ASCII `filename` and a UTF-8 `filename*`. Responses are `private, no-store`.

## Limits

| Limit | Value |
| --- | --- |
| Upload size | 5 MB |
| Extracted text | 80,000 characters |
| DOCX parts read, uncompressed | 20 MB |
| Parsed content stored | 200,000 characters |
| Edits kept per run | 20 |
| Edits stored per version | 40 |

## Live eval

```bash
npx tsx --conditions=react-server scripts/eval/resume-live.ts
```

Parses and tailors the fictional fixtures in `src/lib/resume/fixtures` with Gemini and prints, per file, the parsed counts and grounding drops, the kept edits and validator drops, and whether an injected requirement leaked into an edit. It reads `GEMINI_API_KEY` from the environment or from `.env.local` without printing it, uses `JOB_ANALYSIS_GOOGLE_MODEL` or the default fast model, and writes nothing to a database. It spends tokens.

Regenerate the fixtures with `npx tsx scripts/fixtures/resume-fixtures.mts`. They describe a fictional person and fictional employers only.

## Out of scope

OCR for scanned PDFs, more than one template, and cover letters.
