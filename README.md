# KPTCL DPR Management System — web app

Team web app for managing KPTCL Detailed Project Reports (DPRs).

The admin menu has four items:

- **Dashboard**: DPR counts, a pipeline by lifecycle stage, breakdowns by voltage class
  and project type, budget, and completion by division. Every stage and division links to
  the matching filtered list in Reports.
- **DPR Initialization**: form to register a new DPR (project details, location with
  circle and division search). Approval routing is filled in from the voltage class.
- **DPR Reports**: every DPR, filterable by text, project type, stage and division, with
  **Download Excel** (.xlsx of all rows matching the filters). Filters are kept in the URL,
  so a filtered view can be bookmarked or shared.

- **Documents**: choose an active DPR (search by ID or project name), then attach files to
  each required document in three groups (Core, Statutory, Compensation & deposits). Each
  document shows its source, whether it is mandatory, its status and file count.
  **Submit to Consultant** unlocks once every mandatory document has a file, asks for
  confirmation, then locks the files. Statuses: Awaiting (no file), Uploaded (file attached),
  Pending (sent to the consultant), N/A (optional document marked not applicable).

The app starts with no DPRs. Each page shows an empty state until the first DPR is created.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built app |
| `npm test` | Run unit and component tests (Vitest + Testing Library) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict mode |

## Data

With no backend configured (`VITE_API_BASE_URL` empty), DPRs created on the Initialization
page are saved in the browser's localStorage (`src/lib/sampleStore.ts`) and the dashboard
is computed from them (`src/features/dashboard/summary.ts`). To start over, clear the site
data in the browser.

To use a real API, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`. The
dashboard then calls `GET /api/v1/dashboard/summary`, which must return the
`DashboardSummary` shape in `src/features/dashboard/types.ts`. All money is in Rs. lakhs.

### DPR Initialization API

| Call | Purpose |
| --- | --- |
| `POST /api/v1/dprs` | Create a DPR (`NewDprRequest` in `src/features/initialization/types.ts`) |

Approval routing lives in `src/features/initialization/routing.ts`:
66 kV comes from the old system (CGM (Tech) Corporate Office, group 66/110 kV); 110 kV
is assumed to match; 220 kV and 400 kV approvers are still to be confirmed.

### Locations

The Zone > Circle > Division > Station tree comes from the KPTCL workbook
(`data/tree_map_KPTCL.xlsx`): 6 zones, 15 circles, 58 divisions, 1,443 stations. It is
turned into `src/data/locations.ts` and `src/data/stations.ts` by
`npm run generate:locations` (optionally `-- path/to/new.xlsx`). Do not edit those files by
hand. The script fixes station codes that Excel damaged, ignores repeated rows and prints
what it found. DPR Initialization and the Reports filters use this tree.

### DPR Reports API

| Call | Purpose |
| --- | --- |
| `GET /api/v1/dprs` | DPR report rows (`DprRow` in `src/features/reports/types.ts`) |
| `GET /api/v1/reports/programme` | Scheduled report list |

New DPR IDs follow `DPR/<division code>/<year>/<sequence>`, e.g. `DPR/ALI/2026/0001`.
The Excel file is built in the browser with ExcelJS, which is loaded only when someone
downloads.

## Stack

React 18, TypeScript (strict), Vite, Tailwind CSS, React Router, TanStack Query,
React Hook Form + Zod (forms and validation), ExcelJS (Excel export),
lucide-react icons, Vitest + Testing Library, ESLint.

## Layout

```
src/
  app/            App root, providers, routes
  layouts/        AppLayout (collapsible sidebar + top bar)
  config/         Navigation menu, app constants
  components/ui/  Shared UI: Card, Badge, BarList, ProgressBar, EmptyState, PageHeader,
                  Pagination, Field / TextInput / Select, Combobox, Toaster
  features/
    dashboard/       Dashboard page, summary calculation, API hook, components
    initialization/  New-DPR form, schema, approval routing, API hooks
    reports/         DPR report table, URL filters, Excel export, programme reports
    documents/       Document checklist per DPR, file attach, submit to consultant
    locations/       Location types, lookups and hooks over the generated data
  hooks/          usePageTitle, usePersistentState
  lib/            API client, sample store, storage, formatting, toasts, session
  data/           Generated KPTCL locations (zones, circles, divisions, stations)
  mocks/          Report schedule (reference data)
  pages/          404 page
  test/           Test setup, render helper, fixtures
```

Each new screen goes in its own folder under `src/features/` with its page, API hook,
types and tests.

## Design

- Neutral zinc greys, one blue accent, 1px borders, no shadows on cards. Inter, 13px base.
  Tokens are in `tailwind.config.js` (`gray`, `accent`) and `src/styles/index.css`
  (`.btn-*`, `.input`).
- The sidebar can be hidden with the button in the top bar or **Ctrl+B** (Cmd+B on Mac);
  the choice is remembered. On phones it opens as a drawer (Escape closes it).
- Press **/** to jump to the search box; it opens Reports filtered by the text.
- Confirmations (DPR created, report downloaded, errors) appear as small toasts.
- Each page sets the browser tab title; a "Skip to content" link appears on Tab.

## Next steps

1. Backend API and database (DPRs, divisions, statuses, users, audit log).
2. Login and roles (Admin, Consultant, Reviewer).
3. The rest of the DPR Initialization form (if any).
4. DPR preparation: narrative builder and the cost estimate (BCR, IRR, payback).
