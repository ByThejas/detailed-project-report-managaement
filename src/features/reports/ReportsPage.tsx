import { PageHeader } from '@/components/ui/PageHeader';
import { useDprRegister, useProgrammeReports } from './api';
import { DprRegisterCard } from './DprRegisterCard';
import { ProgrammeReportsCard } from './ProgrammeReportsCard';

export function ReportsPage() {
  const programme = useProgrammeReports();
  const register = useDprRegister();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="DPR Reports" description="Filter DPRs and download them as an Excel file." />
      <div className="space-y-4">
        {register.isError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            Could not load DPRs.{' '}
            <button type="button" className="font-medium underline" onClick={() => register.refetch()}>
              Try again
            </button>
          </div>
        )}
        {register.isPending && <div className="h-48 animate-pulse rounded-lg bg-gray-100" aria-label="Loading DPRs" />}
        {register.data && <DprRegisterCard rows={register.data} />}
        {programme.data && <ProgrammeReportsCard reports={programme.data} />}
      </div>
    </div>
  );
}
