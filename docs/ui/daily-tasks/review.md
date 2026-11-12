# Daily Tasks: before and after

Screenshots: [before](before/) and [after](after/), each as `desktop-dark`, `desktop-light`, and `mobile-dark` (390 px). They are taken by `scripts/perf/daily-tasks.ts` on the perf user with a sample day: two meals, water, sleep, steps, and two of five habits done. The after shots use targets in Cutting mode with protein set to always reach, so each status appears.

| Area | Before | After |
|---|---|---|
| Date | "Selected date" label, a date input, and Previous day / Show date / Next day buttons; the day was kept in the URL | ‹ date › centered at the top; the date opens the picker, and choosing a day navigates at once; a "Today" chip appears on other days; ← → work from the keyboard; always opens on today |
| Checklist | Bordered rows that submitted a form and waited for the server | Large rows (56 px) without borders that check in the next frame, with a check animation, a done count, and strike-through |
| Health | One "Health Tracking (Beta)" disclosure holding bordered cards and inputs with a full-width submit button; targets in a nested disclosure | Health cards with fewer borders; each total shows its target, a bar, and a status word plus icon (Under, Close, Over, Reached, Below); compact inline inputs |
| Targets and preferences | A nested "Targets & Preferences" form | A gear button at the bottom right opens a panel: metric switches, Cutting/Bulking, protein direction, and targets that save as you go |
| Insights | "Weekly Insights" in its own disclosure (last completed week); "Health Insights" collapsed inside health | Health Insights and Weekly Insights side by side at the bottom (stacked on phones); the weekly view follows the selected day's week |
| Manage recurring tasks | Bordered rows with bordered buttons | Same actions with quieter buttons, in a collapsed section |

**Hierarchy.** Title and primary action, then the day, the checklist, health, and management, with insights last. There is one filled primary button (Add daily task) plus the gear. The status colors are tokens that pass WCAG AA in both themes (6.0–6.3:1 light, 8.0–11.0:1 dark), and every status also has an icon and a word.

**Mobile.** The date row fits at 390 px; the food inputs wrap to two columns with a full-width Add; the gear sits above the bottom-right corner, and its panel spans the screen width.
