/** A child rate under a catalog item: erection (labour) or testing & commissioning. */
export interface CatalogChildRate {
  text: string;
  unit: string;
  rate: number;
  sr: string;
}

/** One priced item of the KPTCL rate catalog (Common SoR 2023-24), from src/data/rateCatalog.json. */
export interface CatalogItem {
  id: string;
  sheet: string;
  code: string;
  kind: string;
  item: string;
  /** Chapter heading and shared description above the item. */
  context: string;
  unit: string;
  rate: number | null;
  /** Page or clause in the schedule of rates. */
  sr: string;
  labour: CatalogChildRate[];
  tc: CatalogChildRate[];
}

export interface RateCatalog {
  source: string;
  /** Version of the Common SoR workbook, e.g. 76. */
  version?: number | null;
  items: CatalogItem[];
}
