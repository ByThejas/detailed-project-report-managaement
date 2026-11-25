/** A child rate under a catalog item: erection (labour) or testing & commissioning. */
export interface CatalogChildRate {
  text: string;
  unit: string;
  rate: number;
  sr: string;
}

/** Which catalog an item belongs to: the electrical SoR (rate_catalog) or the civil schedule of rates the user adds. */
export type CatalogBook = 'electrical' | 'civil';

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
  /** 'civil' for an item of the civil catalog; absent for the electrical SoR. */
  book?: 'civil';
}

export interface RateCatalog {
  source: string;
  /** Version of the Common SoR workbook, e.g. 76. */
  version?: number | null;
  items: CatalogItem[];
}
