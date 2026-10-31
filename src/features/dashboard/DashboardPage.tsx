import { Link } from 'react-router-dom';
import { FileStack, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarList } from '@/components/ui/BarList';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiStrip } from './components/KpiStrip';
import { PipelineCard } from './components/PipelineCard';
import { BudgetCard } from './components/BudgetCard';
import { DivisionCompletionTable } from './components/DivisionCompletionTable';
import { useDashboardSummary } from './api';

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-[92px] animate-pulse rounded-lg bg-gray-100" />
      <div className="h-36 animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}

export function DashboardPage() {
  const { data, isPending, isError, refetch } = useDashboardSummary();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Dashboard"
        description="Status of every DPR, by stage and division."
        actions={
          <Link to="/initialization" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            New DPR
          </Link>
        }
      />

      {isPending && <Skeleton />}

      {isError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          Could not load the dashboard.{' '}
          <button type="button" className="font-medium underline" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <KpiStrip counts={data.counts} />
          <PipelineCard stages={data.stages} />

          {data.counts.total === 0 ? (
            <Card>
              <EmptyState
                icon={FileStack}
                title="No DPRs yet"
                hint="Initialize a DPR and it will show up here with its stage, division and progress."
                action={
                  <Link to="/initialization" className="btn-primary">
                    <Plus className="h-4 w-4" aria-hidden />
                    Create your first DPR
                  </Link>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                <Card role="region" aria-labelledby="voltage-title">
                  <CardHeader id="voltage-title" title="By voltage class" />
                  <div className="p-4">
                    <BarList items={data.byVoltage} />
                  </div>
                </Card>
                <Card role="region" aria-labelledby="stream-title">
                  <CardHeader id="stream-title" title="By project type" />
                  <div className="p-4">
                    <BarList items={data.byStream} />
                  </div>
                </Card>
                <BudgetCard finance={data.finance} />
              </div>
              <DivisionCompletionTable rows={data.byDivision} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
