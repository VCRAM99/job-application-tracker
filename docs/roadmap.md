# Roadmap (after V2)

V2.0 ships the AI layer as a closed beta: Gemini with the user's own key, behind `BETA_USER_IDS` and per-feature flags (see [launch.md](launch.md)). These are the next steps, roughly in priority order. None of them is started.

## AI

- **Managed AI with spend caps.** The managed mode, its monthly request and token allowance, and the accounting tables exist but stay unreachable. Before turning them on:
  - add per-user and global spend caps in currency, not only token counts;
  - count provider calls (retries, repairs, and the overload fallback), not just runs;
  - add an operator kill switch;
  - add billing alerts.
- **Live-verify OpenAI and Anthropic.** Both adapters are built and mock-tested. Run the eval suite live against each, confirm the model ids on the providers' pages, then list them in `AI_PROVIDERS_ENABLED` without the "not live-verified" label.
- **Cover letters.** A draft kind built on the coach's draft validator: verified facts only, one claim per sentence, nothing sent.
- **Story bank with several outlines.** More than one STAR outline per competency, with the user choosing which to keep.
- **OCR for scanned resumes.** Image-only PDFs are rejected today. Add an OCR step, with its output treated as unverified text like any other parse.
- **A local AI companion for Windows and macOS.** A Tauri app running models through Ollama, paired with the web app, so resumes and notes never leave the machine. The "Local desktop" execution mode is already reserved and refused.

## Jobs

- **An email alert sender.** Alerts are computed and stored, but `JOB_EMAIL_DELIVERY_ENABLED` stays off until a sender with unsubscribe links, bounce handling, and a sending domain is set up.
- **More ATS sources and a `jobs discover` helper.** Add adapters beyond Greenhouse, Lever, and Ashby, plus a CLI command that finds a company's public board and prints the `register` command for an operator to review. Licensing review stays manual.
- **More industries and countries.** Most fixtures, prompts, and location rules were written with North American and European tech postings in mind. Add fixtures and work-authorization rules for more countries and non-tech roles, and check extraction quality on them.

## Resumes

- **Several resume templates.** One clean single-column PDF/DOCX layout exists today. Add a few more ATS-safe layouts, and fonts for CJK and right-to-left scripts.

## Platform

- **Run the e2e suite in CI** once the local Supabase stack starts reliably there.
