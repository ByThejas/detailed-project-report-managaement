# KPTCL DPR Management System — web app

Team web app for managing KPTCL Detailed Project Reports (DPRs).

The admin menu has five items:

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
- **DPR Preparation**: choose an active DPR to see the ten documents a brownfield DPR is
  prepared from (TCCM proposal and proceedings, electrical and civil BOQ, layout, SLD, grid
  map, earth mat, SCADA & SAS, transformer & feeder load). They are pulled in from the
  Documents section automatically. Below them are the editable **Electrical BOQ (Part A)**
  and **Civil BOQ (Part B)** and the **Abstract-I**. **Download Excel** gives a workbook
  with Abstract, Part A and Part B sheets. The DPR shows **Ready for DPR document** once all
  ten inputs are collected (file or N/A) and every BOQ line has a rate.

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

### Estimate (DPR Preparation)

The method follows the Kogali 66 kV sample DPR (`src/features/preparation/`):

- Each electrical line has supply, erection and testing & commissioning rates; civil lines
  have one rate. Amount = qty × rate, rounded to paise.
- Part A total = line amounts + "miscellaneous and unforeseen" per column. Part B total =
  line amounts + rounding off.
- Abstract-I (Rs lakh, each step rounded to 0.01 like the KPTCL sheets): material (supply)
  + labour (erection + T&C) + civil = basic rate; + area loading (5%); + GST on both (18%)
  = cost put to tender; + statutory charges = total estimate cost.
- A new DPR starts from a template scaled to its capacity (number of transformers drives
  the transformer, NIFPS, CT, NCT, isolator and structure quantities). Rates come from the
  sample's Common SoR for KPTCL, ESCOMs & PWD (Electrical) 2023-24. Only the 66/11 kV
  20 MVA transformer has a rate; others are flagged "Rate needed".
- `calc.test.ts` checks the calculation reproduces the sample's abstract exactly
  (Rs 827.05 lakh).

### Reading BOQ workbooks (`src/features/boq-import/`)

When an `.xlsx` is attached to **Bill of Quantity (Electrical)** or **(Civil)** in Documents,
it is read in the browser straight away. DPR Preparation then offers **Review & import**.
Accuracy rules: the reader never guesses silently.

- The header row is found by its labels (Sl. no., Description/Particulars, Unit,
  Qty/Quantity, Supply/Erection/T&C Rate and Amount), including two-row headers where
  "Supply" sits over "Rate | Amount". Title rows above and a "1 2 3 4…" numbering row are
  skipped.
- Numbers are exact when the cell is a number or "1,23,456.50". Anything interpreted
  (e.g. "2 Nos" read as 2) is a warning the user must tick "Checked, it's right". Anything
  unreadable ("LS", "2x3", "#REF!", a formula with no saved result, a negative quantity) is
  an error the user must fix or skip.
- Every item shows its sheet and row. Hidden rows, repeated item numbers, missing units and
  amounts that differ from qty × rate by more than Re 1 are flagged.
- "Total" and "Sub total" rows are compared with the sum of the items above them.
- Headings and notes (rows without a quantity) are listed, and can be added as items.
  Sub-items ("a", "b", "ii") keep their parent heading in the description.
- Summary sheets (Abstract, Summary, Cover) start excluded so items aren't counted twice.
  Hidden sheets are not read.
- Import stays disabled until every included row is clean, fixed, confirmed or skipped.
  Imported lines record their source ("file · sheet row N").

### Dismantling, general abstract and cost-benefit

- Brownfield DPRs get a **Dismantling (Abstract-II)** table, started from the sample's
  decommissioning sheet (transformer weights are the sample's; take them from the nameplates).
  The **General abstract** is Abstract-I + Abstract-II. With the sample's figures this gives
  827.05 + 1.36 = 828.41 lakh, as in the sample.
- Abstract rows are shown rounded to 0.01 lakh, but the arithmetic carries unrounded values,
  as the KPTCL sheets do (that is what makes Abstract-II 1.36).
- **Cost-benefit** tab: yearly benefits (typed or pasted from the BCR sheet) and a discount
  rate give the B/C ratio (PV of benefits ÷ cost), IRR, and simple and discounted payback.
  With the sample's benefit row this gives IRR 29.6% (the sample prints 29%) and a
  discounted payback of 7 years, as in the sample.
- **Greenfield** DPRs have no dismantling, and their BOQ starts empty until the BOQ
  workbooks are imported.

### DPR document (Word) (`src/features/dpr-document/`)

The **DPR document** tab holds the project facts (section 01) and the text of sections 02–13,
prefilled where the app knows the answer. **Download Word** builds a .docx in the browser
(with the `docx` library, loaded only when used). It contains the cover, contents, sections
01–14, annexure list, Annexure A (general abstract, Abstract-I, Part B, Abstract-II,
dismantling, and Part A on a landscape page) and Annexure D (BCR by year). Until every
input document, rate, benefit and [bracketed] text is in place, the cover is marked
**DRAFT** and lists what is missing.

Estimates are kept in this browser until the backend exists
(planned: `GET/PUT /api/v1/dprs/{id}/estimate`).

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
React Hook Form + Zod (forms and validation), ExcelJS (Excel import and export), docx (Word export),
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
    preparation/     DPR Preparation: input documents, BOQ estimate, abstract, Excel
    boq-import/      Reads BOQ .xlsx files (parse.ts), review screen, storage hooks
    dpr-document/    DPR text, readiness check and the Word (.docx) export
    dprs/            Active DPR picker shared by Documents and Preparation
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
4. Load the Common SoR 2023-24 (Vol-6) rates once received.
5. Work out yearly benefits from energy savings and tariffs once the BCR working sheet is
   available (today they are entered or pasted).

## Deploying to Vercel

Import the folder that contains `package.json` as the project root. `vercel.json` sets the
build (`npm run build`), the output folder (`dist`) and a rewrite that sends every route
(`/dashboard`, `/documents`, a refreshed page, a shared filtered link) to `index.html`, so
the React router can handle it. Without that rewrite Vercel answers 404 NOT_FOUND on any
URL other than `/`.
