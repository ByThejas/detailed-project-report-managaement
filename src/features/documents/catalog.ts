export type Requirement = 'Mandatory' | 'Optional';

export interface DocumentSpec {
  key: string;
  name: string;
  /** Department that provides the document. */
  source: string;
  requirement: Requirement;
}

export interface DocumentGroup {
  key: string;
  title: string;
  documents: DocumentSpec[];
}

const doc = (name: string, source: string, requirement: Requirement): DocumentSpec => ({
  key: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
  name,
  source,
  requirement,
});

/**
 * The documents every DPR needs, copied from the existing Documents screen, plus TCCM Proposal and
 * Transformer & Feeder Load Details, which DPR preparation needs for brownfield work.
 */
export const DOCUMENT_GROUPS: DocumentGroup[] = [
  {
    key: 'core',
    title: 'Core documents',
    documents: [
      doc('TCCM Proposal', 'Operations', 'Mandatory'),
      doc('TCCM Proceedings', 'Operations', 'Mandatory'),
      doc('TAC', 'Operations', 'Optional'),
      doc('Land Records', 'Operations', 'Optional'),
      doc('Layout Drawing', 'Operations', 'Mandatory'),
      doc('Single Line Diagram (SLD)', 'Operations', 'Mandatory'),
      doc('Block Level Diagram', 'Operations', 'Optional'),
      doc('Finished Ground Level (FGL)', 'Operations', 'Optional'),
      doc('Survey Report', 'Operations', 'Optional'),
      doc('Grid Map', 'P&C', 'Mandatory'),
      doc('Bill of Quantity (Electrical)', 'P&C', 'Mandatory'),
      doc('Bill of Quantity (Civil)', 'Civil', 'Optional'),
      doc('Earth-Mat Design', 'R&D', 'Mandatory'),
      doc('SCADA & SAS Details', 'SCADA', 'Optional'),
      doc('Transformer & Feeder Load Details', 'Operations', 'Mandatory'),
    ],
  },
  {
    key: 'statutory',
    title: 'Statutory documents',
    documents: [
      doc('Forest Clearance Deposit', 'Operations', 'Optional'),
      doc('Railway Crossing Charges', 'Operations', 'Optional'),
      doc('PTCC Approval Charges', 'Operations', 'Optional'),
      doc('Electrical Inspectorate Charges', 'Operations', 'Optional'),
      doc('Statutory Department Fees', 'Operations', 'Optional'),
    ],
  },
  {
    key: 'compensation',
    title: 'Compensation & deposits',
    documents: [
      doc('Land & Crop Compensation', 'Operations', 'Optional'),
      doc('Tree Compensation', 'Operations', 'Optional'),
      doc('Crop Compensation', 'Operations', 'Optional'),
      doc('Tower Foot / Land Compensation', 'Operations', 'Optional'),
      doc('Right of Way Compensation', 'Operations', 'Optional'),
    ],
  },
];

export const ALL_DOCUMENTS: DocumentSpec[] = DOCUMENT_GROUPS.flatMap((g) => g.documents);

/** The ten documents a brownfield DPR is prepared from (DPR Preparation pulls these in). */
export const PREPARATION_INPUTS = [
  'tccm-proposal',
  'tccm-proceedings',
  'bill-of-quantity-electrical',
  'bill-of-quantity-civil',
  'layout-drawing',
  'single-line-diagram-sld',
  'grid-map',
  'earth-mat-design',
  'scada-sas-details',
  'transformer-feeder-load-details',
] as const;
