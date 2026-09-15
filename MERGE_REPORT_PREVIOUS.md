# MERGE_REPORT.md — AGROX Current + Latest Changes

Base (current/source of truth): the previously merged project (`AGROX-COMBINED-FINAL.zip`).
Incoming changes: `AGROX-SUCHI_VERSION.zip`.
(The prior merge's own report is kept alongside this one as `MERGE_REPORT_PREVIOUS.md`.)

The incoming version turned out to be a separate branch built on top of the older
"kindwise-groq" lineage — it did **not** have the base's payments/trust/PDF-generation/
Kindwise-vision work, but it added genuinely new features and fixes on the modules it
does share. Per the brief, none of the base's existing functionality was removed; only
the 16 listed changes were pulled in, and only where they were real improvements over
what the base already had.

## What was merged, by item

| # | Change | Files touched | Notes |
|---|--------|---------------|-------|
| 1 | Red alert → bottom-left corner | `components/DisasterReportWidget.tsx`, `pages/Dashboard.tsx` | Adopted the incoming version's fixed circular button (`fixed bottom-6 left-6`) in place of the old top corner card. Confirmed the report-modal/submission logic was untouched by the redesign — no functionality lost. |
| 2 | Daily Planner tab | new: `pages/DailyPlanner.tsx`, `api/daily_plan.py`, `services/daily_planner.py`; +`DailyPlan` model; `main.py` (router + 5 AM IST APScheduler job); `Layout.tsx`, `App.tsx`, `api.ts`, `translations.ts`, `requirements.txt` (+apscheduler) | Full feature ported: on-demand generation, stored history, and a background scheduler that regenerates every farmer's plan daily. |
| 3 | Offer validation (Market) | `pages/Market.tsx` | "Is this offer worth it?" now requires both offer price and bag count (`roiCanCalculate` guard); button disabled and a clear message shown otherwise. Existing calculation logic untouched. |
| 4 | Chatbot confidence scores | `agents/agent.py` (+`compute_confidence`), `components/AdvisorChatPanel.tsx` | Real, computed score (0–100) from what the turn actually did — data sources used, cross-check agreement, whether the LLM ran, intent specificity — never hardcoded. Shown as a toggle with a one-line reason and, when available, a per-source breakdown. |
| 5 | Multi-source AI fallback | new: `services/cross_check.py`; `agents/agent.py` | Irrigation/weather answers now silently cross-check sensor + weather + satellite + soil in parallel; conflicts are surfaced as facts the LLM must explain. A new `cross_verify` intent (recognized via expanded `nlp.py` keywords) lets a farmer explicitly ask "are you sure?" and get the full source-by-source breakdown. |
| 6 | Admin AI icon | `components/FloatingAdvisor.tsx` | Admin's launcher/chat header now renders in indigo with a distinct icon (🌾) instead of the farmer's green 🌱, so the two agents are visually distinguishable. |
| 7 | Admin AI scheme output | `api/alerts_admin.py` | Admin's `/api/admin/ask` now answers "how many farmers applied for [scheme], from which states" from real `SchemeInterest` records (with scheme-name/short-code matching), rather than ever pointing an admin at a farmer-only page. |
| 8 | District rankings (multiple districts) | `database/seed.py`, `services/government_funding.py` | See "seed_regional_farmers" below — District Ranking now reflects real registered farmers across every district, not a handful of manual demo accounts. |
| 9 | District funding (10+ real districts) | `services/government_funding.py` | `STATE_DISTRICTS["Madhya Pradesh"]` expanded from 6 to 16 real districts (Indore plus 15 more); Tamil Nadu 6→8, Karnataka 5→7. |
| 10 | Crop-health map consistency | `database/seed.py` (regional seeding); verified `services/government_funding.py::crop_health_heatmap` | Confirmed by reading the code that the heatmap and the district drill-down were **already** computed from the same function (`admin_intel.state_detail`) — there was no separate/divergent code path in either version. The reported "map says fine, drill-down says danger" symptom is consistent with sparse seed data (only a handful of districts had any pest/disease records at all); the new regional seeding gives every district real, consistent records. Verified programmatically after seeding that heatmap severity and the district detail's own pest/disease report list always agree. |
| 11 | State Intelligence demo users | `database/seed.py` | Same `seed_regional_farmers()` — 28 realistic farmers (name, phone, crop, land, soil test, sensor history, pest/disease observations, scheme interest, marketplace listings) spread across every district, idempotent and safe to re-run. |
| 12 | Priority Alerts → View Details opens the incident | `services/admin_intel.py` (+`report_id` on emergency alerts), `pages/Admin.tsx` | This was a real bug present in **both** versions: "View details" unconditionally called `goState(a.state)`. Fixed it properly: emergency-type alerts (which are always backed by a real `DisasterReport`) now carry a `report_id` and jump straight to that incident in the new Disaster Reports tab; the remaining statistical alerts (pest trend, water stress, scheme adoption — which are genuinely state-level, not tied to one incident) still go to State Intelligence, which is the correct destination for those. |
| 13 | Exact incident data | new: `GET /api/admin/disaster-reports`, `GET /api/admin/disaster-reports/{id}`; `pages/Admin.tsx` `DisasterReportsTab` | Shows exactly what the farmer captured — description, severity + severity reason, location, date, routed-to channel, reference number, media-attached flag, farmer name. Nothing generic or fabricated. |
| 14 | Admin response controls | +4 columns on `DisasterReport` (`assigned_admin_id`, `assigned_at`, `help_requested_at`, `help_requested_note`); new `POST .../take-responsibility`, `POST .../request-help`; `pages/Admin.tsx` | Neither version actually had this working yet, so it was built for real rather than mocked: an admin can take direct ownership of an incident (shows "✅ Assigned to: <name>") or trigger a help/escalation request with an optional note (shows "🆘 Help requested"), both persisted to the database. |
| 15 | Buyer manure purchase workflow | `api/marketplace.py` (`product_type=all`), `pages/Marketplace.tsx` | Crops and farmer-made manure now share **one** browsable grid (unified tab) instead of a separate, disconnected "Compost & manure" tab — manure categories always show (even with zero listings) so buyers know the option exists. Reuses the exact same `CropListing`/order/contact-reveal infrastructure that produce already uses; no new/duplicate purchase pipeline was created. |

## Conflicts found and how they were resolved

- **Vision/AI architecture**: the incoming version is built on the pre-Kindwise, pre-payments/trust lineage. Nothing about that was merged back — the base's Kindwise vision system, escrow payments, trust/reviews, PDF contract generation, and the Messages inbox were all left exactly as they were. Only the specific 16 listed changes were pulled from the incoming version.
- **`AdvisorChatPanel.tsx` / `FloatingAdvisor.tsx`**: diffed line-by-line before adopting wholesale — confirmed every change was strictly additive (new conditional branches, new fields) with nothing from the base's existing chat UI removed.
- **`alerts_admin.py` scheme-application block**: the incoming version and the base ended up with the same two code blocks in a different order after merging (verified via a sorted-content diff — byte-for-byte identical, just reordered). No functional difference.
- **Priority Alerts "View Details"**: rather than blindly porting the incoming version's code (which still had the bug, since neither version had actually fixed it), this was implemented properly using the new `report_id` link and the new incident detail view.
- **Admin response controls**: same situation — neither version had a working implementation, so real database fields and endpoints were added instead of faking it with static UI.
- **Market.tsx / harvest.py auth (from the earlier merge)**: untouched by this pass; still intact.

## Database changes

- `DailyPlan` (new table): `daily_plans` — one row per farmer per day.
- `DisasterReport` (existing table, extended): added `assigned_admin_id`, `assigned_at`, `help_requested_at`, `help_requested_note`, and a second `User` relationship (`assigned_admin`) alongside the existing `user` relationship.
- No tables were removed or had columns dropped.

## API changes

- New: `GET /api/daily-plan/today`, `POST /api/daily-plan/refresh`, `GET /api/daily-plan/history`.
- New: `GET /api/admin/disaster-reports`, `GET /api/admin/disaster-reports/{id}`, `POST /api/admin/disaster-reports/{id}/take-responsibility`, `POST /api/admin/disaster-reports/{id}/request-help`.
- Extended: `GET /api/admin/ask` now answers scheme-application questions from real data.
- Extended: `GET /api/marketplace/crops-available` and `GET /api/marketplace/listings` accept `product_type=all` for the unified crop+manure browse.
- Total route count after merge: 246 (was 239 before this pass).

## Modules merged / files touched

Backend: `main.py`, `models/models.py`, `agents/agent.py`, `ai/nlp.py`, `api/alerts_admin.py`, `api/marketplace.py`, `services/admin_intel.py`, `services/government_funding.py`, `database/seed.py`, plus new `services/cross_check.py`, `api/daily_plan.py`, `services/daily_planner.py`.

Frontend: `App.tsx`, `layouts/Layout.tsx`, `services/api.ts`, `i18n/translations.ts`, `pages/Dashboard.tsx`, `pages/Market.tsx`, `pages/Admin.tsx`, `pages/Marketplace.tsx`, `components/DisasterReportWidget.tsx`, `components/AdvisorChatPanel.tsx`, `components/FloatingAdvisor.tsx`, plus new `pages/DailyPlanner.tsx`.

## Tests performed

- `python -m compileall` across the full backend tree — clean.
- Fresh `pip install -r requirements.txt` — installs without conflicts.
- `from app.main import app` — imports successfully, **246 routes** registered.
- `pytest tests/` — **424 passed, 1 failed, 16 skipped**. The one failure (`test_alerts.py::test_subscribe_is_idempotent_per_endpoint`) is the same pre-existing `PushSubscription.active`-attribute bug identified and confirmed unrelated to this merge in the previous pass.
- End-to-end seed test on a fresh SQLite database: `seed()` + `seed_regional_farmers()` ran cleanly, created 28 regional farmers across 42 districts total, 4 disaster reports, and 100 district-funding rows.
- Verified programmatically (not just by inspection) that `crop_health_heatmap()` and `admin_intel.state_detail()` — the map and the drill-down — read the exact same underlying pest/disease records for every district in the freshly seeded data.
- Verified `priority_alerts()` correctly attaches `report_id` to every emergency-type alert, matching real `DisasterReport` rows.
- `npm install && npm run build` (`tsc -b && vite build`) — **zero TypeScript errors**, clean production bundle.
- `node tests/i18n.test.mjs` — same pre-existing gaps as before this merge (5 missing nav keys in Tamil/Hindi, a fixed list of pages with some hardcoded English strings); confirmed no *new* hardcoded strings were introduced by this merge's own additions (Daily Planner and Disaster Reports tab both use `t()` throughout).

## Remaining known issues (pre-existing, not introduced by this merge)

- `test_subscribe_is_idempotent_per_endpoint` still fails (missing `PushSubscription.active` column expected by that one test).
- Tamil/Hindi translations still missing the same 5 navigation keys, and the same list of pages still have some hardcoded English strings — unrelated to anything changed in this pass.
- Crop-health map consistency (item 10) is architecturally verified rather than reproducing-and-fixing a specific broken code path, since no divergent computation was found in either version — see the note in the table above.
