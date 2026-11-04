# Rate catalog (canonical)

The app prices every BOQ from **one** catalog: the KPTCL Common SoR 2023-24 workbook **`rate_catalog 76.xlsx`**, version **76**.

- Source workbook, kept in this repo as `data/rate_catalog.xlsx` (SHA-256 `5a7d2a9a27d6651d2aefd48ec5e8853a866e6a62208c5eb65f2694de41a1b2d9`, 334,958 bytes).
- Bundled data: `src/data/rateCatalog.json` (3,800 priced items, `source` and `version` recorded inside). The DPR Preparation page and the BOQ test bench both load it through `src/features/rates/catalog.ts`.
- Rebuild after a new version: put the workbook at `data/rate_catalog.xlsx`, run `npm run generate:rates -- data/rate_catalog.xlsx "rate_catalog 77.xlsx"`, then update the hash above. A test fails until the hash, source name and version agree.
- Sheets: By code (1,212 items), utilization works (1,327), utilization material (557), SR-CSR 2023-24 Stock 11 kV (623), 33 kV (51), SR-Part-IV Civil Works (30).
- Not in this version: a 110/11 kV 8 MVA power transformer (the 8 MVA item, 1.13, is 66/11 kV); no "KPWD" civil items (civil rates come from the Part-IV sheet and the BOQ's own PWD SR refs).
