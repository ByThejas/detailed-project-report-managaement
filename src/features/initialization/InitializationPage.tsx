import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/lib/toast';
import { useCircles, useDivisions, useStations, useZones } from '@/features/locations/api';
import { useCreateDpr } from './api';
import { approvalRouteFor } from './routing';
import { newDprSchema, type NewDprForm } from './schema';
import { CAPACITY_MVA, CAPACITY_UNITS, formatCapacity, PROJECT_TYPES, VOLTAGE_CLASSES, type CreatedDpr } from './types';

const DEFAULTS: NewDprForm = {
  projectName: '',
  projectType: 'Greenfield',
  voltageClass: '66 kV',
  capacityUnits: '' as NewDprForm['capacityUnits'],
  capacityMva: '' as NewDprForm['capacityMva'],
  location: '',
  zoneId: '',
  circleId: '',
  divisionId: '',
  stationCode: '',
};

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-4 border-b border-gray-200 px-4 py-5 last:border-b-0 sm:px-6 md:grid-cols-[180px_1fr]">
      <div>
        <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SuccessPanel({ dpr, onAnother }: { dpr: CreatedDpr; onAnother: () => void }) {
  return (
    <Card role="region" aria-labelledby="created-title" className="mx-auto max-w-lg px-6 py-10 text-center">
      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" strokeWidth={1.75} aria-hidden />
      <h2 id="created-title" className="mt-3 text-base font-semibold text-gray-900">
        DPR initialized
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">
        <span className="text-gray-900">{dpr.projectName}</span> is now in the Data Pending stage.
      </p>
      <dl className="mx-auto mt-5 max-w-xs divide-y divide-gray-100 rounded-md border border-gray-200 text-left text-[13px]">
        <div className="flex justify-between gap-4 px-3 py-2">
          <dt className="text-gray-500">DPR ID</dt>
          <dd className="num text-gray-900">{dpr.id}</dd>
        </div>
        <div className="flex justify-between gap-4 px-3 py-2">
          <dt className="text-gray-500">Final approver</dt>
          <dd className="text-right text-gray-900">{dpr.finalApprover}</dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-secondary" onClick={onAnother}>
          Initialize another
        </button>
        <Link to={`/reports?q=${encodeURIComponent(dpr.id)}`} className="btn-secondary">
          View in reports
        </Link>
        <Link to={`/documents?dpr=${encodeURIComponent(dpr.id)}`} className="btn-primary">
          Add documents
        </Link>
      </div>
    </Card>
  );
}

export function InitializationPage() {
  const [created, setCreated] = useState<CreatedDpr | null>(null);
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm<NewDprForm>({ resolver: zodResolver(newDprSchema), defaultValues: DEFAULTS, mode: 'onTouched' });

  const zoneId = watch('zoneId');
  const circleId = watch('circleId');
  const divisionId = watch('divisionId');
  const voltageClass = watch('voltageClass');
  const route = approvalRouteFor(voltageClass);

  const zones = useZones();
  const circles = useCircles(zoneId);
  const divisions = useDivisions(circleId);
  const stations = useStations(divisionId);
  const create = useCreateDpr();

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { capacityUnits, capacityMva, ...rest } = values;
      const dpr = await create.mutateAsync({ ...rest, capacity: formatCapacity(capacityUnits, capacityMva) });
      setCreated(dpr);
      toast({ title: 'DPR initialized', description: dpr.id });
    } catch {
      toast({ title: 'Could not create the DPR', description: 'Please try again.', tone: 'error' });
    }
  });

  // Same office is the common case for a batch of DPRs, so keep circle and division.
  const another = () => {
    reset({
      ...DEFAULTS,
      zoneId: created?.zoneId ?? '',
      circleId: created?.circleId ?? '',
      divisionId: created?.divisionId ?? '',
    });
    create.reset();
    setCreated(null);
  };

  const err = (id: keyof NewDprForm) => errors[id]?.message;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="DPR Initialization" description="Register a new DPR. Approval routing is set from the voltage class." />

      {created ? (
        <SuccessPanel dpr={created} onAnother={another} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
          <form onSubmit={onSubmit} noValidate aria-label="New DPR">
            <Card>
              <Section title="Project" description="What is being built.">
                <Field id="projectName" label="Project name" required error={err('projectName')}>
                  <TextInput id="projectName" placeholder="110/11kV Channapatna New S/S" invalid={!!errors.projectName} {...register('projectName')} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="projectType" label="Project type" required>
                    <Select id="projectType" options={PROJECT_TYPES} {...register('projectType')} />
                  </Field>
                  <Field id="voltageClass" label="Voltage class" required>
                    <Select id="voltageClass" options={VOLTAGE_CLASSES} {...register('voltageClass')} />
                  </Field>
                  <div className="sm:col-span-2 sm:max-w-sm">
                  <Field id="capacityUnits" label="Capacity" required error={err('capacityUnits') ?? err('capacityMva')}>
                    <div className="flex items-center gap-2">
                      <Select
                        id="capacityUnits"
                        aria-label="Number of units"
                        placeholder="Units"
                        options={CAPACITY_UNITS}
                        invalid={!!errors.capacityUnits}
                        {...register('capacityUnits')}
                      />
                      <span className="text-gray-400" aria-hidden>
                        ×
                      </span>
                      <Select
                        id="capacityMva"
                        aria-label="MVA rating"
                        placeholder="Rating"
                        options={CAPACITY_MVA}
                        invalid={!!errors.capacityMva}
                        {...register('capacityMva')}
                      />
                      <span className="text-[13px] font-medium text-gray-700">MVA</span>
                    </div>
                  </Field>
                  </div>
                </div>
              </Section>

              <Section title="Location" description="Where it is and which office owns it.">
                <Field id="location" label="Location / place" required error={err('location')}>
                  <TextInput id="location" placeholder="Channapatna" invalid={!!errors.location} {...register('location')} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field id="zoneId" label="Zone" required error={err('zoneId')}>
                    <Controller
                      control={control}
                      name="zoneId"
                      render={({ field }) => (
                        <Combobox
                          id="zoneId"
                          options={zones}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            setValue('circleId', '');
                            setValue('divisionId', '');
                            setValue('stationCode', '');
                          }}
                          onBlur={field.onBlur}
                          placeholder="Search zones"
                          invalid={!!errors.zoneId}
                        />
                      )}
                    />
                  </Field>
                  <Field id="circleId" label="Circle" required error={err('circleId')} hint={zoneId ? undefined : 'Choose a zone first'}>
                    <Controller
                      control={control}
                      name="circleId"
                      render={({ field }) => (
                        <Combobox
                          id="circleId"
                          options={circles}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            setValue('divisionId', '');
                            setValue('stationCode', '');
                          }}
                          onBlur={field.onBlur}
                          disabled={!zoneId}
                          placeholder="Search circles"
                          invalid={!!errors.circleId}
                          describedBy={zoneId ? undefined : 'circleId-hint'}
                        />
                      )}
                    />
                  </Field>
                  <Field id="divisionId" label="Division" required error={err('divisionId')} hint={circleId ? undefined : 'Choose a circle first'}>
                    <Controller
                      control={control}
                      name="divisionId"
                      render={({ field }) => (
                        <Combobox
                          id="divisionId"
                          options={divisions}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            setValue('stationCode', '');
                          }}
                          onBlur={field.onBlur}
                          disabled={!circleId}
                          placeholder="Search divisions"
                          invalid={!!errors.divisionId}
                          describedBy={circleId ? undefined : 'divisionId-hint'}
                        />
                      )}
                    />
                  </Field>
                </div>
                <Field
                  id="stationCode"
                  label="Existing station"
                  hint={divisionId ? 'Optional. Pick the station this DPR is about, if it already exists.' : 'Optional. Choose a division first.'}
                >
                  <Controller
                    control={control}
                    name="stationCode"
                    render={({ field }) => (
                      <Combobox
                        id="stationCode"
                        options={(stations.data ?? []).map((s) => ({ id: s.code, name: `${s.name} (${s.voltage})` }))}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          const picked = stations.data?.find((s) => s.code === v);
                          if (picked && !getValues('location').trim()) setValue('location', picked.name, { shouldValidate: true });
                        }}
                        onBlur={field.onBlur}
                        disabled={!divisionId}
                        placeholder={stations.isPending && divisionId ? 'Loading stations…' : 'Search stations'}
                        describedBy="stationCode-hint"
                      />
                    )}
                  />
                </Field>
              </Section>

              <div className="flex flex-col-reverse gap-2 rounded-b-lg border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                <button type="button" className="btn-secondary" onClick={() => reset(DEFAULTS)}>
                  Clear
                </button>
                <button type="submit" className="btn-primary" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Initialize DPR
                </button>
              </div>
            </Card>
          </form>

          <aside aria-label="Approval routing" className="lg:sticky lg:top-6">
            <Card>
              <CardHeader title="Approval routing" subtitle="Set from the voltage class" />
              <dl className="divide-y divide-gray-100 px-4 text-[13px]">
                <div className="py-2.5">
                  <dt className="text-xs text-gray-500">Final approver</dt>
                  <dd className="mt-0.5 font-medium text-gray-900" data-testid="final-approver">
                    {route.finalApprover ?? 'To be confirmed'}
                  </dd>
                </div>
                <div className="py-2.5">
                  <dt className="text-xs text-gray-500">Voltage group</dt>
                  <dd className="mt-0.5 font-medium text-gray-900" data-testid="voltage-group">
                    {route.voltageGroup}
                  </dd>
                </div>
              </dl>
              {route.finalApprover === null && (
                <p className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  The approver for {voltageClass} is not confirmed yet. The DPR can still be created.
                </p>
              )}
              <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">New DPRs start in the Data Pending stage.</p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
