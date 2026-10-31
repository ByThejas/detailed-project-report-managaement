import type { BadgeTone } from '@/components/ui/Badge';
import type { Stage } from './types';

/** One colour per lifecycle stage, shared by badges and the pipeline bar. */
export const stageTone: Record<Stage, BadgeTone> = {
  Draft: 'gray',
  'Data Pending': 'amber',
  'Under Validation': 'blue',
  'Under Approval': 'violet',
  'Pending Dependencies': 'orange',
  Generated: 'green',
};

export const stageBar: Record<Stage, string> = {
  Draft: 'bg-gray-300',
  'Data Pending': 'bg-amber-400',
  'Under Validation': 'bg-accent-500',
  'Under Approval': 'bg-violet-500',
  'Pending Dependencies': 'bg-orange-400',
  Generated: 'bg-emerald-500',
};
