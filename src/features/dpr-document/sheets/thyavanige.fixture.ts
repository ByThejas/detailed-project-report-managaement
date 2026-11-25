import { buildTemplate } from '@/features/preparation/template';
import { DEFAULT_BCR_INPUTS } from '@/features/preparation/finance';
import { row } from '@/test/fixtures';
import { defaultContent, type DprContent } from '../content';

/** The Thyavanige DPR (THYAVANIGE_20MVA_LILO_DIS_Merge.pdf) as typed into the app: the reference for the printed pages. */
export const THY_DPR = row({ project: 'Additional 1x20 MVA at 66/11 kV Thyavanige', stream: 'Brownfield', voltage: '66/11 kV', capacity: '1x20 MVA', station: 'Thyavanige' });

const NAME =
  'Providing additional 1x20 MVA Power Transformer at 66/11kV Thyavanige sub-station and providing 66kV LILO arrangement to Thyavanige sub-station from existing 66kV Kukkawada-Basavapatna line with construction of 66kV line terminal Bays at 66/11kV Thyavanige substation in Channagiri Taluk, Davanagere District.';

export function thyavanigeContent(): DprContent {
  const c = defaultContent(THY_DPR, true);
  return {
    ...c,
    details: {
      ...c.details,
      nameOfWork: NAME,
      location: '66/11 kV Thyavanige Substation, Channagiri Taluk, Davanagere District; Operations Division, Benkikere, Tumakuru Operations Zone',
      existingCapacity: '1×12.5 MVA, 66/11 kV — recorded peak load 10.6 MW, loading factor 0.99 (overloaded)',
      mvaAdded: '20 MVA (1×20 MVA, 66/11 kV).',
      lineComponent: '66 kV LILO on the existing 66 kV Kukkawada–Basavapatna DC line (Coyote), on DC towers in the existing corridor.',
      terminalBays: '66 kV line terminal bays — 2 nos. (per TCCM), with 2 transformer bays and a new 66 kV rigid bus in the Estimate (4 bays in all); existing 1×12.5 MVA transformer shifted to the new position.',
      existingSource: '220/66 kV SRS Davanagere — installed capacity 3×100 MVA, recorded peak load 77 MW, 87 MW and 77.9 MW; 66 kV Davanagere–Kukkawada–Basavapatna line recorded peak load 19.6 MW (196 A)',
      approval: '6th TCCM of BESCOM (Brown Field) held on 24.09.2026 & 29.09.2026, Subject-63.',
      budgetProvision: 'Included in List – III, FY 2026-27 APW Code: BB1189.',
      apwCode: 'BB1189',
      financialYear: 'FY 2026-27',
      jurisdiction: 'Tumakuru Operation Zone',
      projectNature: 'Brown Field — Additional Transformer + LILO',
      coverSubtitle: 'Channagiri Taluk, Davanagere District.',
      runningTitle: '66/11 kV Thyavanige station — additional 1×20 MVA transformer and LILO arrangement',
      preparedBy: 'Prasanna Technologies Pvt. Ltd.',
      reportMonth: 'October 2026',
    },
    sections: {
      ...c.sections,
      scope:
        'This project report envisages providing an additional 1×20 MVA, 66/11 kV Power Transformer with associated 11 kV MCVCB switchgear at 66/11 kV Thyavanige Substation, and providing a 66 kV LILO arrangement to Thyavanige Substation from the existing 66 kV Kukkawada–Basavapatna line on DC towers, from the Thyavanige tapping point to the substation in the existing corridor for a distance of about 0.25 km with Coyote conductor, together with construction of 66 kV terminal bays and a new 66 kV rigid bus, and shifting of the existing 1×12.5 MVA transformer to the new position, in Channagiri Taluk, Davanagere District, under Operations Division, Benkikere.',
      existing: [
        '1. 66/11 kV Thyavanige Substation is on a tapping arrangement from the 66 kV Davanagere–Kukkawada–Basavapatna line, which caters to the load of two substations — 66/11 kV Thyavanige and 66/11 kV Basavapatna. The line recorded a peak load of 19.6 MW (196 A).',
        '2. 220/66 kV SRS Davanagere has an installed capacity of 3×100 MVA, 220/66 kV transformers, with recorded peak loads of 77 MW, 87 MW and 77.9 MW. The DPR for augmentation of the 2×100 MVA, 220/66/11 kV power transformers to 2×150 MVA was approved on 25.03.2025, and the augmentation, along with strengthening of the 220 kV Guttur–Davanagere 3 circuits with Drake-equivalent HPC conductor, was approved in the 1st TCCM of BESCOM dated 29.03.2025.',
        '3. 66/11 kV Thyavanige Substation presently has only one 1×12.5 MVA, 66/11 kV power transformer, with a recorded peak load of 10.6 MW and a loading factor of 0.99 (99%). The transformer is overloaded.',
        '4. The existing 66 kV Kukkawada–Basavapatna line, with Coyote conductor, was commissioned on 09.09.2022. It passes through plain terrain, with no railway crossing and no 400/220/66 kV line crossing.',
        '{table}',
        '5. There is no line control at Thyavanige Substation, and the existing transformer does not have separate metering and protection equipment. Only one 66 kV circuit breaker is provided for both line and transformer protection.',
      ].join('\n'),
      problems: [
        '1. Presently there is only one 1×12.5 MVA, 66/11 kV power transformer at 66/11 kV Thyavanige Substation, with a recorded peak load of 10.6 MW and a loading factor of 0.99. The transformer is overloaded.',
        '2. Seven hours of continuous power supply cannot be arranged from Thyavanige Substation. Supply is restricted to six hours to manage the load on the transformer, and Y-operations are being conducted on overloaded feeders.',
        '3. If a fault occurs on the transformer, it is very difficult to arrange power supply to the connected feeders as per schedule.',
        '4. The substation is on a tapping arrangement. In case of a line fault between Kukkawada and Basavapatna substations, power supply to Thyavanige Substation is interrupted.',
        '5. There is no line control at Thyavanige Substation, and the existing transformer does not have separate metering and protection equipment.',
        '6. There is a space constraint to provide an additional line terminal bay for the LILO arrangement. Shifting of the existing transformer position is therefore necessary, and demolition of the dilapidated KPTCL quarters is essential to accommodate the space.',
        '7. Due to the space constraint, a rigid bus needs to be provided.',
        '8. Since the work involves shifting of the existing transformer to a new position and creation of a new 66 kV rigid bus, line bays and transformer bays, it is essential to take up the additional transformer and the LILO arrangement as a single project.',
      ].join('\n'),
      objectivesPrimary: [
        '1. To provide continuous 7 hours power supply to all the feeders as per schedule.',
        '2. To reduce power interruptions.',
        '3. To reduce the load on the existing power transformer.',
        '4. To meet (n-1) criteria for both the transmission line and the transformer.',
      ].join('\n'),
      objectivesSecondary: [
        '1. To provide system stability.',
        '2. To provide reliable restoration of power supply during transformer failure.',
        '3. To cater to future loads with additional feeders.',
        '4. To provide line control and separate metering and protection for the transformers and lines.',
      ].join('\n'),
      schedule: 'Provisional PERT chart enclosed.',
      results: [
        '1. A standardised power supply system, with 7 hours of continuous 3-phase power supply to IP/rural feeders and redundancy in power supply.',
        '2. Reduction of system losses.',
        '3. Improved reliability of power supply.',
        '4. Improved voltage conditions.',
        '5. 24×7 power supply arrangement.',
        '6. Compliance with (n-1) criteria.',
      ].join('\n'),
      alternatives:
        'The existing 1×12.5 MVA transformer is overloaded and the substation is fed through.  66 kV Kukkawada - Basavapatna tap line. Providing the additional transformer and the LILO arrangement within the existing yard is not possible, owing to the space constraint and line-clearance issues. Hence it is proposed to provide the 66 kV line and transformer bays, a new rigid bus and an extension of the existing station control room at an alternate location within the KPTCL premises, after demolishing the adjacent dilapidated KPTCL quarters, and to take up the additional transformer and the LILO arrangement as a single project, as it is more cost effective than taking them up separately.',
      proposals: [
        '1. Providing an additional 1×20 MVA, 66/11 kV, ONAN/ONAF power transformer with OLTC at 66/11 kV Thyavanige Substation, Channagiri Taluk, Davanagere District, together with associated 11 kV 25 kA MCVCB switchgear (1 Incomer + 6 Feeders + 2 Bus Couplers + 2 Capacitor Bank panels + 1 Annunciator panel), 11 kV UG cables and NIFPS.',
        '2. Providing 66 kV LILO arrangement to the substation from the existing 66 kV Kukkawada–Basavapatna line, on DC towers from the tapping point to 66/11 kV substation, in the existing corridor, for a distance of about 0.25 km with Coyote conductor, with 3 nos. of new 110 kV D/C NBT towers.',
        '3. Construction of 66 kV terminal bays — 2 nos. line bays (one for the existing line and one for the proposed line) and 2 nos. transformer bays — together with a new 66 kV rigid bus, at the alternate location within the KPTCL premises.',
        '4. Shifting of the existing 11 kV double-pole structures and the auxiliary transformer to a suitable alternate location, to create space for the new rigid bus.',
        '5. Providing additional earthmat of 2793 sq m in the extended yard, as per the SEE (R&D) design.',
        '6. Necessary civil works in connection with the above, including equipment foundations, cable trenches, internal roads, drains and MCVCB shelter.',
      ].join('\n'),
      towers: 'As per the Estimate, 3 new 110 kV D/C NBT towers (KPTCL design) are proposed for the LILO line.',
      costBenefit: 'The BCR, IRR and payback period for the work are as below.',
      expenditure: 'The provisional expenditure is 80% of the awarded amount within a year from the date of award, and the balance 20% of the awarded amount during the consequent year.',
      approvals: 'The subject work was approved in the 6th TCCM of BESCOM (Brown Field) held on 24.09.2026 & 29.09.2026, Subject No-63.',
      budget: 'The subject work is included in List III of FY 2026-27, APW code: BB1189.',
    },
    tables: {
      existing: {
        title: 'Substations connected to the 66 kV Davanagere–Kukkawada–Basavapatna line',
        columns: ['Sl. no.', 'Station', 'Installed capacity', 'Peak load'],
        rows: [
          ['1', '66/11 kV Thyavanige', '1×12.5 MVA, 66/11 kV', '10.6 MW'],
          ['2', '66/11 kV Basavapatna', '1×12.5 MVA + 1×20 MVA, 66/11 kV', '9.4 MW, 9.8 MW'],
        ],
      },
      towers: {
        title: 'Proposed 110 kV D/C towers (NBT KPTCL design)',
        columns: ['Sl. no.', 'Type of tower', 'Total'],
        rows: [
          ['1', '110 kV DD+0 (Normal)', '1'],
          ['2', '110 kV DD+6', '1'],
          ['3', '110 kV DD+6 with Auxiliary cross arm', '1'],
        ],
      },
    },
    salient: [
      { label: 'Layout/BOM', value: 'The Bill of Material for the work were issued vide letter No. CEE/P&C/SET/EET-3/AEE-1/KCO-104/2024-25/25043-47, dated 15.03.2025, of the Chief Engineer (Elec.), Planning & Co-ordination, KPTCL, on the basis of the site conditions and recommendations of the CEE, Operations, Tumakuru.' },
      { label: 'Earthing materials', value: 'Additional earthmat is provided as per the SEE (R&D) design, Drg. No. ಅ.ಇಂ(ಎ)/ಸಂ.ಮತ್ತು ಅ/ಕಾ.ನಿ.ಇಂ/ಕೆ.ಸಿ.ಓ-126/ಎಫ್-96(07)/2025-26/888-90, dated 22.05.2025,\ncommunicated vide letter No: ಅ.ಇಂ(ಎ)/ಸಂ.ಮತ್ತು ಅ/ಕಾ.ನಿ.ಇಂ/ಕೆ.ಸಿ.ಓ-126/ಎಫ್-96(07)/2025-26/885-87, dated 22.05.2025' },
      { label: 'Transformer and switchgear', value: '1×20 MVA, 66/11 kV transformer with OLTC, and 11 kV, 25 kA, 500 MVA MCVCB switchgear (1600 A incomer, 1250 A feeders), SCADA-compatible.' },
      { label: 'SCADA and control', value: 'Provision is made for SCADA communication equipment (RTU, DCU, MFTs, UPS).' },
      { label: 'Civil works', value: 'Provision for necessary civil work is included in the estimate as per site conditions.' },
      { label: 'Dismantling', value: 'The dilapidated KPTCL quarters are to be demolished, and existing equipment, structures and fence are to be shifted/dismantled as required to accommodate the new bays and rigid bus.' },
      { label: 'Certificate', value: 'The DPR is prepared as per the Common Schedule of Rates for KPTCL, ESCOMs & PWD (Electrical) 2023-24, Volume-6.' },
      { label: 'Transformer capacity enhanced', value: 'Transformer capacity enhanced from 1x12.5 MVA to 1x20 MVA, 66/11kV as per KPTCL Proceedings dated 20.02.2025 (Memo No. KPTCL/2024-25/117), superseding the earlier TCCM-approved Capacity.' },
    ],
  };
}

/** The Thyavanige estimate record with the DPR's text and its BCR inputs. */
export function thyavanigeEstimate() {
  const e = buildTemplate(THY_DPR);
  e.misc = { supply: 100_000, erection: 0, testing: 0, civil: 0, dismantling: 0 };
  e.financials = { method: 'kptcl', discountRatePct: 9, benefits: [], inputs: { ...DEFAULT_BCR_INPUTS, addedMva: 20, salePrice: 8.96, transmissionCharge: 0.79, loadGrowthPct: 8, discountRatePct: 9 } };
  e.document = thyavanigeContent();
  return e;
}
