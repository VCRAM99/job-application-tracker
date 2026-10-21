# Job Tracker

Job Tracker is a full-stack web application for organizing a job search in one place. It brings application tracking, company research, networking, interview preparation, and daily productivity tools into a single private workspace.

The interface is meant to stay practical: clear records, straightforward forms, and a layout that is easy to use on a desk or a phone.

**Live app:** [Try Job Tracker](https://jobtracker.varunsr.com)

Create an account with your email. The app asks you to verify that address before you can use the signed-in pages. There is no shared demo login.

## Features

### Job search

- Application pipeline with status tracking
- Company research and organization
- Networking contacts and follow-ups
- One-time tasks and deadlines
- Interview and certification preparation
- Dashboard statistics and upcoming actions

### Daily productivity

- Recurring daily tasks
- Custom weekday schedules
- A checklist for the selected day
- Weekly completion insights

### Career profile (off by default)

Career facts, pasted resume text, and AI settings are hidden in production until the server flag is turned on. Suggested facts stay suggestions until you accept them. See [docs/ai.md](docs/ai.md).

### Optional health tracking (beta)

Health tracking is off for new accounts. Turn it on in Settings if you want it. Saved entries stay private to your account when the section is hidden.

- Calorie and protein logging
- Water tracking with quick increments
- Sleep and step tracking
- Weight history
- Optional daily targets
- Health trend charts

### Data management

- CSV and XLSX imports from official templates
- CSV exports
- Duplicate detection
- Server-side validation

### Using the app

- Dark and light modes
- Responsive layout
- Short page transitions
- Email and password sign-in

## Tech stack

**Frontend.** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, and Recharts.

**Backend and database.** Supabase Auth and PostgreSQL, with Row Level Security on user-owned tables.

**Deployment.** Vercel, at [jobtracker.varunsr.com](https://jobtracker.varunsr.com).

## Local development

Developed with Node.js 24 and npm 11.

```bash
git clone https://github.com/VCRAM99/job-application-tracker.git
cd job-application-tracker
npm install
cp .env.example .env.local
```

Set these variables in `.env.local`. Copy the URL and publishable key from your Supabase project. Do not put a service-role or secret key in any `NEXT_PUBLIC_` variable.

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (the legacy anon key also works here) |
| `NEXT_PUBLIC_SITE_URL` | App origin. Use `http://localhost:3000` locally |

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

A Supabase project with email confirmation, plus the SQL migrations in `supabase/migrations`, is required before companies, applications, and the other signed-in tools will load. Deploying the Next.js app does not apply those migrations. Setup for auth redirects, mail, and `npx supabase db push` is in [docs/setup.md](docs/setup.md). Column rules are in [docs/data-model.md](docs/data-model.md). Career AI configuration is in [docs/ai.md](docs/ai.md). Server-only AI variables are commented in `.env.example`. Do not commit real keys.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Production build |

## Security and privacy

Sign-up uses email and password, and email verification is required before private pages are available. Sessions stay in HTTP-only cookies.

Each person’s companies, applications, contacts, tasks, preparation notes, daily tasks, and health entries are stored under their own user id. Supabase Row Level Security limits select, insert, update, and delete to that user. Health tracking is optional and is not shared between accounts.

Forms and imports are checked on the server. This repository does not claim an independent security certification or a completed third-party audit.

## Developer

Developed by Varun Ramanathan.

Portfolio: [varunsr.com](https://varunsr.com) · GitHub: [VCRAM99](https://github.com/VCRAM99)
