import type { Circle, Division } from '@/features/initialization/types';

/**
 * SAMPLE master data, not KPTCL's real list.
 * Division names appear on the old dashboard; the circle grouping is a placeholder
 * until the real circle -> division list is supplied.
 */
export const circlesSample: Circle[] = [
  { id: 'c-bagalkot', name: 'Bagalkot Circle' },
  { id: 'c-belagavi', name: 'Belagavi Circle' },
  { id: 'c-bengaluru', name: 'Bengaluru Circle' },
  { id: 'c-tumakuru', name: 'Tumakuru Circle' },
];

export const divisionsSample: Division[] = [
  { id: 'd-bagalkote', name: 'Bagalkote', circleId: 'c-bagalkot' },
  { id: 'd-belagavi', name: 'Belagavi', circleId: 'c-belagavi' },
  { id: 'd-alipura', name: 'Alipura', circleId: 'c-bengaluru' },
  { id: 'd-bengaluru-north', name: 'Bengaluru North', circleId: 'c-bengaluru' },
  { id: 'd-tumakuru', name: 'Tumakuru', circleId: 'c-tumakuru' },
];
