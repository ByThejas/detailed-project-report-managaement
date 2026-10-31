import { useSearchParams } from 'react-router-dom';
import { useDprRegister } from '@/features/reports/api';
import type { DprRow } from '@/features/reports/types';

/** The DPR chosen on a page, kept in the URL (?dpr=) so links and reloads keep it. */
export function useActiveDpr() {
  const [params, setParams] = useSearchParams();
  const dprs = useDprRegister();
  const wanted = params.get('dpr') ?? '';
  const active: DprRow | undefined = dprs.data?.find((d) => d.id === wanted);
  const choose = (id: string) => setParams(id ? { dpr: id } : {}, { replace: true });
  return { dprs, active, choose };
}
