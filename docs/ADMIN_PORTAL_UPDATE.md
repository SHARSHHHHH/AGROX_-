# Admin Portal Update — District Funding & Navigation

## What changed

- Reworked the admin header/sidebar language to feel like an agriculture administration dashboard rather than a technical command center.
- Removed **Scheme Eligibility** from the admin sidebar and from the Admin page tab registry/rendering.
- Rebuilt **District Funding** around official Madhya Pradesh PM-KISAN district data instead of illustrative DistrictFunding seed rows.
- District Funding now contains all **55 Madhya Pradesh districts**.
- Official data source: Government of India, Rajya Sabha Unstarred Question No. 2409, Annexure II, PM-KISAN 21st instalment, data as on **05-03-2026**.
- The official source reports **8,181,751** Madhya Pradesh beneficiaries for the 21st instalment.
- The page derives the 21st-instalment support value as `beneficiaries × ₹2,000` and annual entitlement as `beneficiaries × ₹6,000`. These are explicitly described as derived calculations, not district budget allocations.
- Added district search, beneficiary sorting, source badges, a state summary, and a district detail card.
- The District Funding page no longer displays the old DEMO/illustrative funding rows, releases, utilization percentages, or fake district allocations.

## Why this approach

Public government sources do not provide a single current district-wise MP agriculture-budget allocation table suitable for claiming exact district expenditure. Showing the old seeded rupee allocations as if they were government allocations would therefore be misleading.

The replacement uses a government-published district-wise financial-beneficiary dataset that is available for every MP district. This keeps the admin page fact-based while still giving the officer a useful district-level funding/support view.

## Source

Government of India / Rajya Sabha, Unstarred Question No. 2409, Annexure II:
`https://sansad.in/getFile/annex/270/AU2409_K32YjT.pdf?source=pqars`


## Verified district funding expansion

The District Funding admin tab now supports verified district-level PM-KISAN datasets for Madhya Pradesh, Maharashtra, Rajasthan, and Tamil Nadu. It no longer silently falls back to illustrative district allocations. Each row carries the Government of India source, source URL, instalment, and data date. Tamil Nadu uses the Parliament-published 20th-instalment district disbursement table (Apr-Jul 2025); Maharashtra uses the 20th instalment (as on 04-08-2025); Rajasthan uses the 21st instalment (up to 25-11-2025); MP uses the 21st-instalment beneficiary dataset as on 05-03-2026, with support derived at the standard ₹2,000 per instalment.
