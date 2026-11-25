import type { DetailKey, SectionKey } from '../content';

/** A Report text field the Generate button can draft. */
export type DraftTarget =
  | { kind: 'detail'; key: DetailKey }
  | { kind: 'section'; key: SectionKey }
  | { kind: 'salient'; label: string };

export interface FieldGuide {
  /** What the text must say and in what form. */
  guide: string;
  /** Wording from the finished Thyavanige DPR, for form only. */
  example?: string;
  /** Documents most likely to hold the facts. */
  docs: string[];
  /** Not found in project documents: the app says so instead of drafting. */
  notInDocuments?: string;
}

const TCCM = ['tccm-proceedings', 'tccm-proposal'];
const LOAD = ['transformer-feeder-load-details', ...TCCM];
const ALL = [...TCCM, 'transformer-feeder-load-details', 'survey-report', 'layout-drawing', 'single-line-diagram-sld', 'tac', 'land-records'];

export const DETAIL_GUIDES: Record<DetailKey, FieldGuide> = {
  nameOfWork: { guide: 'The name of work exactly as the TCCM approval or proposal words it (one sentence, starting "Providing…", "Construction of…" etc.).', example: 'Providing additional 1×20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation in Channagiri Taluk, Davanagere District, with 66 kV LILO arrangement.', docs: TCCM },
  location: { guide: 'Station name and voltage, taluk, district, and the Operations division in charge.', example: '66/11 kV Thyavanige Substation, Channagiri Taluk, Davanagere District; Operations Division, Benkikere', docs: ALL },
  existingCapacity: { guide: 'Installed transformers at the station today (number × MVA, voltage ratio), the recorded peak load in MW and, when both are known, the loading factor. "Not applicable (new sub-station)" for a new station.', example: '1×12.5 MVA, 66/11 kV — recorded peak load 10.6 MW, loading factor 0.99 (overloaded)', docs: LOAD },
  mvaAdded: { guide: 'Capacity this work adds: number × MVA and voltage ratio, as approved.', example: '20 MVA (1×20 MVA, 66/11 kV).', docs: TCCM },
  lineComponent: { guide: 'The line work: voltage, LILO or new line, the existing line it taps or the stations it joins, circuit and conductor, and route length when given.', example: '66 kV LILO on the existing 66 kV Kukkawada–Basavapatna DC line (Coyote)', docs: [...TCCM, 'survey-report', 'single-line-diagram-sld'] },
  terminalBays: { guide: 'Line terminal bays in the work: voltage and number, and where.', example: '66 kV line terminal bays — 2 nos. (per TCCM)', docs: [...TCCM, 'layout-drawing', 'single-line-diagram-sld'] },
  existingSource: { guide: 'The upstream source station feeding this station: name, transformers and recorded peak loads.', example: '220/66 kV SRS Davanagere — 3×100 MVA, recorded peak loads 77, 87 and 77.9 MW', docs: [...LOAD, 'single-line-diagram-sld', 'grid-map'] },
  approval: { guide: 'The TCCM meeting that approved the work: its number, ESCOM, field type if stated, date, and subject number.', example: '6th TCCM of BESCOM (Brown Field) held on 24.09.2026, Subject-63.', docs: TCCM },
  budgetProvision: { guide: 'The budget list, financial year and APW code the work is included in.', example: 'Included in List – III, FY 2026-27 APW Code: BB1189.', docs: [...TCCM, 'tac'] },
  apwCode: { guide: 'The APW code only.', example: 'BB1189', docs: [...TCCM, 'tac'] },
  financialYear: { guide: 'The financial year of the budget provision, as "FY 2026-27".', example: 'FY 2026-27', docs: [...TCCM, 'tac'] },
  jurisdiction: { guide: 'The Transmission (Operations) zone the work falls under.', example: 'Tumakuru Operation Zone', docs: ALL },
  projectNature: { guide: 'Brown Field or Green Field, then the kind of work in a few words.', example: 'Brown Field — Additional Transformer + LILO', docs: TCCM },
  coverTitle: { guide: 'A shorter form of the name of work for the cover, keeping capacity, station and line work.', example: 'Providing additional 1×20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation, with 66 kV LILO arrangement', docs: TCCM },
  coverSubtitle: { guide: 'Taluk and district of the station, as "<name> Taluk, <name> District."', example: 'Channagiri Taluk, Davanagere District.', docs: ALL },
  runningTitle: { guide: 'A short title for the page footer: station, capacity added and line work, under about 90 characters.', example: '66/11 kV Thyavanige station — additional 1×20 MVA transformer and LILO arrangement', docs: TCCM },
  preparedBy: { guide: 'The consultant or office preparing the DPR.', docs: [], notInDocuments: 'who prepares the DPR (your consultant or office)' },
  preparedByRole: { guide: 'The role of whoever prepares the DPR.', docs: [], notInDocuments: 'the role of whoever prepares the DPR' },
  reportMonth: { guide: 'Month and year of the report.', docs: [] },
  substationEstimateTitle: { guide: 'Title of the substation estimate, starting "Estimate for", following the name of work.', example: 'Estimate for providing additional 1×20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation in Channagiri Taluk, Davanagere District', docs: TCCM },
  lineEstimateTitle: { guide: 'Title of the line estimate: the line, from where to where, length and conductor.', example: 'Construction of 66 kV LILO line from … for a distance of about 0.115 km with Coyote ACSR', docs: [...TCCM, 'survey-report'] },
  dismantlingTitle: { guide: 'Title of the dismantling (revenue works) estimate, naming what is dismantled.', example: 'Decommissioning / dismantling of existing assets', docs: [...TCCM, 'layout-drawing'] },
  certificate: { guide: 'The certificate printed on the general abstract: who prepared the estimate, based on whose estimate, most economical execution.', example: 'Certified that the project estimate has been prepared by my gazetted Assistant based on the estimate sent by EEE, Operation division, … for the most economical way of execution of the work.', docs: ALL },
  signatory: { guide: 'Designation and office of the officer signing the general abstract (usually the Superintending Engineer of the zone).', example: 'Superintending Engineer Elecl(O), Transmission (Operations) Zone, KPTCL Tumakur.', docs: ALL },
};

export const SECTION_GUIDES: Record<SectionKey, FieldGuide> = {
  scope: { guide: 'One or two paragraphs: what the project report envisages, the capacity added or replaced, the line and bay works, and where.', example: 'This project report envisages providing additional 1×20 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige substation with 66 kV LILO arrangement on the existing 66 kV Kukkawada–Basavapatna DC line.', docs: TCCM },
  existing: { guide: 'Numbered points on how the station is fed today: source station, line and conductor, installed capacity, recorded peak loads, feeders if the documents give them.', example: '1. The 66/11 kV Thyavanige substation is fed from 220/66 kV SRS Davanagere through the 66 kV … line.\n2. The station has 1×12.5 MVA, 66/11 kV power transformer with a recorded peak load of 10.6 MW.', docs: LOAD },
  problems: { guide: 'Numbered points on the problem this work solves: overloading, reliability, voltage, single source, load growth, as the documents state it.', example: '1. The existing 12.5 MVA power transformer is loaded to 99%, leaving no margin for new loads.', docs: LOAD },
  objectivesPrimary: { guide: 'Numbered main objectives of the work, following from the problems.', example: '1. To reduce the load on the existing power transformer.', docs: LOAD },
  objectivesSecondary: { guide: 'Numbered further benefits: stability, future loads, additional feeders, reliability, as the documents support.', example: '1. To improve system stability.\n2. To meet future loads with additional 11 kV feeders.', docs: LOAD },
  schedule: { guide: 'Schedule of implementation.', docs: [] },
  results: { guide: 'Numbered results expected after commissioning, as the documents support (reliability, losses, voltage, relief of overload).', example: '1. Improved reliability of power supply.\n2. Reduction of system losses.', docs: LOAD },
  alternatives: { guide: 'Alternatives considered and why this one was chosen, only as the documents discuss them.', example: 'The proposal was examined in the TCCM and the present arrangement was found to be the most economical.', docs: TCCM },
  proposals: { guide: 'Numbered list of each work proposed in this DPR (transformer, bays, line, civil, dismantling), as approved.', example: '1. Providing additional 1×20 MVA, 66/11 kV power transformer.\n2. Construction of 66 kV LILO line.', docs: [...TCCM, 'layout-drawing', 'single-line-diagram-sld'] },
  towers: { guide: 'One sentence on the number of new towers proposed for the line.', example: 'As per the Estimate, 2 new towers are proposed for the line.', docs: [...TCCM, 'survey-report'] },
  costBenefit: { guide: 'Cost–benefit text.', docs: [] },
  expenditure: { guide: 'Expenditure phasing.', docs: [] },
  approvals: { guide: 'One sentence: the work was approved in the TCCM meeting (number, ESCOM, date, subject number).', example: 'The subject work was approved in the 6th TCCM of BESCOM held on 24.09.2026, Subject No-63.', docs: TCCM },
  budget: { guide: 'One sentence: the budget list, financial year and APW code the work is included in.', example: 'The subject work is included in List III of FY 2026-27, APW code: BB1189.', docs: [...TCCM, 'tac'] },
};

const SALIENT: Record<string, FieldGuide> = {
  'Layout/BOM': { guide: 'The letter that issued the layout and Bill of Material: number, date and issuing office.', example: 'The Bill of Material for the work was issued vide letter No. …, dated …, of the Chief Engineer (Elec.), Planning & Co-ordination, KPTCL.', docs: ['layout-drawing', 'single-line-diagram-sld', 'bill-of-quantity-electrical'] },
  'Earthing materials': { guide: 'The earthmat design: drawing number, date and the office that designed it.', example: 'Earthmat is provided as per the SEE (R&D) design, Drg. No. …, dated ….', docs: ['earth-mat-design'] },
  'Transformer and switchgear': { guide: 'Transformer rating and voltage ratio, OLTC, 11 kV switchgear and panels in the work.', example: '1×20 MVA, 66/11 kV power transformer with OLTC, 11 kV switchgear and control and relay panels.', docs: [...TCCM, 'layout-drawing', 'single-line-diagram-sld', 'bill-of-quantity-electrical'] },
  'SCADA and control': { guide: 'SCADA and communication provision (RTU, DCU, MFTs, UPS) as the documents give it.', docs: ['scada-sas-details', 'bill-of-quantity-electrical'] },
  'Civil works': { guide: 'Civil works in the scope (foundations, cable trench, control room, roads, fencing), as the documents give them.', docs: ['layout-drawing', 'bill-of-quantity-electrical', ...TCCM] },
  Dismantling: { guide: 'Existing equipment, structures or buildings to be dismantled or shifted.', docs: [...TCCM, 'layout-drawing'] },
  Certificate: { guide: 'The schedule of rates the DPR is prepared to.', example: 'The DPR is prepared as per the Common Schedule of Rates for KPTCL, ESCOMs & PWD (Electrical) 2023-24, Volume-6.', docs: [] },
};

export function guideOf(t: DraftTarget): FieldGuide {
  if (t.kind === 'detail') return DETAIL_GUIDES[t.key];
  if (t.kind === 'section') return SECTION_GUIDES[t.key];
  return SALIENT[t.label] ?? { guide: `The "${t.label}" salient feature of the work, in one or two sentences.`, docs: [...TCCM, 'layout-drawing', 'bill-of-quantity-electrical'] };
}

export const targetId = (t: DraftTarget) => (t.kind === 'salient' ? `salient:${t.label}` : `${t.kind}:${t.key}`);
