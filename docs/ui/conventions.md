# UI conventions

Job Tracker aims for calm, restrained screens: one clear primary action per view, explanations on demand, and nothing important hidden. These rules came out of M6b ([audit](audit.md), [before and after](review.md)).

## Page header

Use `PageHeader` from `src/components/records/fields.tsx` on every page.

```tsx
<PageHeader
  title="Applications"
  help="Track each role from Saved through Offer, including the company it belongs to."
  subtitle={application.companyName}
  action={<Button …>Add application</Button>}
  menu={<MoreActions>…</MoreActions>}
/>
```

- **`title`**: the page name, or the record's name on a detail page.
- **`help`**: what the page is for and any rules. It goes in a HelpTip next to the title, never in a paragraph below it.
- **`subtitle`**: visible context only. Use it for the company, a count, or a contact line, or for a note on the must-see list below. Keep it to one line.
- **`action`**: the primary action. Use at most one filled button, plus one or two outline buttons when an action is used constantly (Edit, Mark complete).
- **`menu`**: everything else, in a ⋯ menu.

Use `SectionHeader` for section titles inside a page (title, optional `help`, optional action on the right). Inside cards, use `CardTitle` with the `help` prop. `CardTitle` renders an `h2` by default; pass `as="h3"` when the card sits under another `h2`.

## HelpTip rules

`HelpTip` (`src/components/ui/help-tip.tsx`) is a small "?" button. It opens on hover, keyboard focus, and tap, and closes on Escape, blur, or a tap outside. Screen readers announce its text through `aria-describedby`.

- **Use it for:** what a page or section does, how a number is calculated, import rules, and why something was dropped.
- **Label it:** `About <title>`, or a specific phrase such as `Why items were dropped`.
- **Never for required information.** Anything a person must see to act correctly stays visible (see the list below). A tap opens a HelpTip on mobile, but a HelpTip is never the only way to learn something required.
- **Keep it short.** Two or three sentences at most. If it needs more, it belongs in the docs.

## ⋯ menus

`MoreActions` (`src/components/ui/more-actions.tsx`) holds secondary actions.

- It is a disclosure (a button with `aria-expanded` and a list), not a full ARIA menu, so it adds almost no JavaScript. It opens on click, Enter, or Space and closes on Escape (focus returns to the button), a click outside, or choosing an item.
- **What goes in:** delete, rarely used navigation (Analyze fit, Tailor resume, All analyses), and less frequent feedback (Not interested, Already applied, Prefer company, Exclude company, Dismiss suggestion).
- **What stays out:** the page's primary action, and anything used on most visits.
- **Delete:** use `DeleteRecordButton asMenuItem`. It keeps the same confirmation dialog and confirm label. The panel stays mounted, so the dialog survives the menu closing.
- **Item labels repeat the full action** ("Delete application", not "Delete").
- **Actions with a result message** (such as the job feedback actions in `JobMoreActions`) show the message next to the ⋯ button, outside the panel.

## Must stay visible

These are never tooltip-only:

- "Qualification match estimate" with its disclaimer, "Match estimate … Not an interview prediction", and "Not an ATS score".
- "AI draft", "Not sent", "Marked sent", "AI-parsed · unverified", "AI-proposed · unverified", and the Suggested and Verified labels on Career.
- Billing mode next to every AI action ("Your key" or "Managed"), and the provider · model · mode line on AI output.
- Destructive-action confirmation dialogs.
- Form validation errors and form status messages.
- The research brief's "From your sources only. Each claim quotes one."
- State messages: a feature is off, a migration is missing, or a load failed.

## Empty states

Use `RecordState` with a short title, an optional one-line description, and one action. Put explanation in the page's HelpTip, not in the empty state.

## Progressive disclosure

Long optional detail starts closed in a native `<details>`. Examples: the jobs page's "More filters" (opens by itself when a filter is set) and each job's "Why this estimate". Keep the summary text a plain label.

## Navigation

The sidebar groups items into **Track** (Dashboard, Applications, Companies, Networking, Tasks), **Discover** (Jobs, Fit), **Prepare** (Resumes, Preparation, Career), and **You** (Daily Tasks, Settings). Items behind a flag that is off are hidden, and a group with no visible items is dropped. The current page uses `aria-current="page"` and the accent background. On mobile the same list opens in the left sheet.

## Spacing, type, and color

- **Page widths:** a page is a `mx-auto flex w-full max-w-* flex-col gap-6` column (`gap-8` on detail pages). Use `max-w-6xl` for lists, `max-w-4xl` for details, and `max-w-3xl` for settings and forms.
- **Surfaces:** cards and sections use the `.surface` class (border, card background, `--radius-xl`, a subtle shadow).
- **Type:**
  - Page titles: `text-2xl font-semibold tracking-tight`.
  - Section titles: `text-sm font-medium` (`text-base` inside cards).
  - Body: `text-sm`. Secondary text: `text-muted-foreground`.
  - Small uppercase labels: stat and nav group labels only.
- **Color:** neutral first. Status colors (`--status-*`) are only for statuses, and `--destructive` is only for destructive actions and errors. Use at most one filled primary button per view.
- **Focus:** every interactive element shows `focus-visible:ring-3 focus-visible:ring-ring/50` or the `.pressable` outline.
