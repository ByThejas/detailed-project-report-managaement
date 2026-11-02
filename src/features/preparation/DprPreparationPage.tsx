import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  Check,
  Download,
  FileStack,
  FileText,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActiveDprPicker } from "@/features/dprs/ActiveDprPicker";
import { DprSummaryHeader } from "@/features/dprs/DprSummaryHeader";
import { useActiveDpr } from "@/features/dprs/useActiveDpr";
import { useDprDocuments } from "@/features/documents/api";
import {
  ALL_DOCUMENTS,
  PREPARATION_INPUTS,
} from "@/features/documents/catalog";
import { filesOf, statusOf } from "@/features/documents/state";
import {
  EMPTY_DOCUMENTS,
  type DocStatus,
  type DprDocuments,
} from "@/features/documents/types";
import type { DprRow } from "@/features/reports/types";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { BOQ_DOCUMENTS, useBoqReads } from "@/features/boq-import/api";
import { BoqReview } from "@/features/boq-import/BoqReview";
import {
  applyImport,
  sectionLabel,
  type ImportMode,
  type ImportPlan,
} from "@/features/boq-import/toEstimateLine";
import { openErrors, warningsOf } from "@/features/boq-import/parse";
import { isReadableBoq } from "@/features/boq-import/readWorkbook";
import type { BoqReadResult } from "@/features/boq-import/types";
import type { BoqReads } from "@/lib/sampleStore";
import { useEstimate, useSaveEstimate } from "./api";
import { BoqTable } from "./BoqTable";
import { RatePricingCard } from "@/features/rates/RatePricingCard";
import { CostBenefitCard } from "./CostBenefitCard";
import { LoadDataCard } from "./LoadDataCard";
import { crossChecks } from "@/features/dpr-document/crossChecks";
import {
  GenerateDprPanel,
  ReportTextPanel,
} from "@/features/dpr-document/DprDocumentPanel";
import { PertPanel } from "@/features/dpr-document/PertPanel";
import { contentOf } from "@/features/dpr-document/content";
import {
  STEPS,
  dprChecklist,
  type StepKey,
} from "@/features/dpr-document/readiness";
import {
  abstractOf,
  generalAbstract,
  hasLineWorks,
  linesMissingRates,
  type AbstractPart,
} from "./calc";
import { exportEstimate } from "./exportEstimate";
import { NumberInput } from "./NumberInput";
import { buildTemplate } from "./template";
import type { Estimate } from "./types";

const lakhs = (n: number) => formatNumber(Math.round(n * 100) / 100);
const STATUS_TONE: Record<DocStatus, BadgeTone> = {
  Awaiting: "amber",
  Uploaded: "green",
  Pending: "blue",
  "N/A": "gray",
};
const INPUT_SPECS = PREPARATION_INPUTS.map(
  (key) => ALL_DOCUMENTS.find((d) => d.key === key)!,
);

/** An input counts as collected once it has a file or is marked not applicable. */
const isCollected = (docs: DprDocuments, key: string) =>
  statusOf(docs, key) !== "Awaiting";

function SummaryStrip({ collected, e }: { collected: number; e: Estimate }) {
  const g = generalAbstract(e);
  const items = [
    { label: "Input documents", value: `${collected} / ${INPUT_SPECS.length}` },
    { label: "Substation works (Abstract-I), Rs lakh", value: lakhs(g.capital) },
    ...(hasLineWorks(e)
      ? [{ label: "Line works, Rs lakh", value: lakhs(g.line) }]
      : []),
    {
      label: "Dismantling (Abstract-II), Rs lakh",
      value: lakhs(g.dismantling),
    },
    { label: "Total project cost, Rs lakh", value: lakhs(g.total) },
  ];
  return (
    <section aria-label="Estimate summary">
      <dl
        className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 ${items.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
      >
        {items.map(({ label, value }) => (
          <div key={label} className="bg-white px-4 py-3.5">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="num mt-1 text-2xl font-semibold tracking-tight text-gray-900">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BoqReadState({
  files,
  reads,
  onReview,
}: {
  files: { name: string }[];
  reads: BoqReadResult[];
  onReview: (r: BoqReadResult) => void;
}) {
  if (!files.length) return null;
  return (
    <ul className="mt-1.5 w-full space-y-1 pl-9 text-xs">
      {files.map((f) => {
        const read = reads.find((r) => r.fileName === f.name);
        let state;
        if (!isReadableBoq(f.name))
          state = (
            <span className="text-gray-500">
              Not read: quantities are read from .xlsx files only
            </span>
          );
        else if (!read)
          state = (
            <span className="text-gray-500">
              Not read yet: attach the file again in Documents to read it
            </span>
          );
        else if (read.failure)
          state = <span className="text-rose-700">{read.failure}</span>;
        else {
          const attention = read.items.filter(
            (i) => openErrors(i).length || warningsOf(i).length,
          ).length;
          state = (
            <>
              <span className="text-gray-600">
                {read.items.length} items read
                {attention ? `, ${attention} to check` : ", all clean"}
              </span>
              <button
                type="button"
                className="btn-secondary h-7 px-2 text-xs"
                onClick={() => onReview(read)}
              >
                Review &amp; import
              </button>
            </>
          );
        }
        return (
          <li
            key={f.name}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="font-medium text-gray-700">{f.name}</span>
            {state}
          </li>
        );
      })}
    </ul>
  );
}

function InputsCard({
  dprId,
  docs,
  reads,
  onReview,
}: {
  dprId: string;
  docs: DprDocuments;
  reads: BoqReads;
  onReview: (r: BoqReadResult) => void;
}) {
  return (
    <Card role="region" aria-labelledby="inputs-title">
      <CardHeader
        id="inputs-title"
        title="Input documents"
        subtitle="Collected automatically from the Documents section"
        action={
          <Link
            to={`/documents?dpr=${encodeURIComponent(dprId)}`}
            className="btn-secondary"
          >
            Manage documents
          </Link>
        }
      />
      <ol className="divide-y divide-gray-100">
        {INPUT_SPECS.map((spec, i) => {
          const status = statusOf(docs, spec.key);
          const files = filesOf(docs, spec.key);
          return (
            <li
              key={spec.key}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]"
            >
              <span className="num w-5 text-gray-400">{i + 1}</span>
              <span className="min-w-[12rem] flex-1 text-gray-900">
                {spec.name}
              </span>
              <span
                className="min-w-0 max-w-full truncate text-xs text-gray-500 sm:max-w-[20rem]"
                title={files.map((f) => f.name).join(", ")}
              >
                {files.length
                  ? files.map((f) => f.name).join(", ")
                  : status === "N/A"
                    ? "Not applicable"
                    : "Not uploaded yet"}
              </span>
              <Badge tone={STATUS_TONE[status]}>
                {status === "Awaiting" ? "Missing" : status}
              </Badge>
              {BOQ_DOCUMENTS[spec.key] && (
                <BoqReadState
                  files={files}
                  reads={reads[spec.key] ?? []}
                  onReview={onReview}
                />
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function AbstractTable({
  rows,
}: {
  rows: { key: string; label: string; lakhs: number; emphasis?: boolean }[];
}) {
  return (
    <table className="w-full text-[13px]">
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.key}
            className={`border-b border-gray-100 last:border-0 ${r.emphasis ? "bg-gray-50 font-medium text-gray-900" : "text-gray-700"}`}
          >
            <td className="num w-10 py-2 pl-4 text-gray-400">{i + 1}</td>
            <td className="py-2">{r.label}</td>
            <td className="num py-2 pr-4 text-right">{lakhs(r.lakhs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ABSTRACT_META: Record<AbstractPart, { title: string; subtitle: string }> = {
  I: { title: "Abstract-I", subtitle: "Substation capital works · Rs lakh" },
  line: { title: "Abstract: line works", subtitle: "Line supply, erection and civil works · Rs lakh" },
  II: { title: "Abstract-II", subtitle: "Dismantling · Rs lakh" },
};

function ChargeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <NumberInput
        label={label}
        value={value}
        onChange={onChange}
        className="w-28 border-gray-200"
      />
    </label>
  );
}

function AbstractCard({
  e,
  part,
  onChange,
}: {
  e: Estimate;
  part: AbstractPart;
  onChange: (e: Estimate) => void;
}) {
  const id = `abstract-${part}-title`;
  const meta = ABSTRACT_META[part];
  const lc = e.lineCharges ?? {
    statutory: 0,
    forestCompensation: 0,
    landCompensation: 0,
  };
  const setLine = (patch: Partial<typeof lc>) =>
    onChange({ ...e, lineCharges: { ...lc, ...patch } });
  return (
    <Card role="region" aria-labelledby={id}>
      <CardHeader id={id} title={meta.title} subtitle={meta.subtitle} />
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-200 px-4 py-3 text-[13px] text-gray-600">
        {part === "I" && (
          <>
            <label className="flex items-center gap-1">
              Area loading %
              <NumberInput
                label="Area loading %"
                value={e.areaLoadingPct}
                onChange={(n) => onChange({ ...e, areaLoadingPct: n })}
                className="w-16 border-gray-200"
              />
            </label>
            <label className="flex items-center gap-1">
              GST %
              <NumberInput
                label="GST %"
                value={e.gstPct}
                onChange={(n) => onChange({ ...e, gstPct: n })}
                className="w-16 border-gray-200"
              />
            </label>
            <ChargeInput
              label="Statutory charges (Rs)"
              value={e.statutoryCharges}
              onChange={(n) => onChange({ ...e, statutoryCharges: n })}
            />
            <ChargeInput
              label="Forest / tree / crop compensation (Rs)"
              value={e.forestCompensation ?? 0}
              onChange={(n) => onChange({ ...e, forestCompensation: n })}
            />
            <ChargeInput
              label="Land / corridor compensation (Rs)"
              value={e.landCompensation ?? 0}
              onChange={(n) => onChange({ ...e, landCompensation: n })}
            />
          </>
        )}
        {part === "line" && (
          <>
            <span>
              Area loading {e.areaLoadingPct}% and GST {e.gstPct}%, as in
              Abstract-I
            </span>
            <ChargeInput
              label="Line statutory charges (Rs)"
              value={lc.statutory}
              onChange={(n) => setLine({ statutory: n })}
            />
            <ChargeInput
              label="Line forest / tree / crop compensation (Rs)"
              value={lc.forestCompensation}
              onChange={(n) => setLine({ forestCompensation: n })}
            />
            <ChargeInput
              label="Line land / corridor / tower-foot compensation (Rs)"
              value={lc.landCompensation}
              onChange={(n) => setLine({ landCompensation: n })}
            />
          </>
        )}
        {part === "II" && (
          <>
            <span>
              Area loading {e.areaLoadingPct}% and GST {e.gstPct}%, as in
              Abstract-I
            </span>
            <ChargeInput
              label="Dismantling statutory charges (Rs)"
              value={e.dismantlingStatutory ?? 0}
              onChange={(n) => onChange({ ...e, dismantlingStatutory: n })}
            />
          </>
        )}
      </div>
      <AbstractTable rows={abstractOf(e, part)} />
    </Card>
  );
}

function GeneralAbstractCard({
  e,
  brownfield,
}: {
  e: Estimate;
  brownfield: boolean;
}) {
  const g = generalAbstract(e);
  const rows = [
    {
      key: "capital",
      label: "Substation capital works (Abstract-I)",
      lakhs: g.capital,
    },
    ...(hasLineWorks(e)
      ? [{ key: "line", label: "Line works", lakhs: g.line }]
      : []),
    ...(brownfield
      ? [
          {
            key: "dismantling",
            label: "Dismantling of the existing equipment (Abstract-II)",
            lakhs: g.dismantling,
          },
        ]
      : []),
    {
      key: "total",
      label: "Total project cost",
      lakhs: g.total,
      emphasis: true,
    },
  ];
  return (
    <Card role="region" aria-labelledby="general-abstract-title">
      <CardHeader
        id="general-abstract-title"
        title="General abstract"
        subtitle="Rs lakh"
      />
      <AbstractTable rows={rows} />
    </Card>
  );
}

function Workspace({ dpr, docs }: { dpr: DprRow; docs: DprDocuments }) {
  const estimate = useEstimate(dpr);
  const save = useSaveEstimate(dpr.id);
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [reviewing, setReviewing] = useState<BoqReadResult | null>(null);
  const [tab, setTabState] = useState<StepKey>("inputs");
  const setTab = (step: StepKey) => {
    setTabState(step);
    requestAnimationFrame(() =>
      document
        .getElementById(`tab-${step}`)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
    );
  };
  const reads = useBoqReads(dpr.id);

  if (!estimate.data)
    return (
      <div
        className="h-24 animate-pulse rounded-lg bg-gray-100"
        aria-label="Loading estimate"
      />
    );
  const e = estimate.data;
  const change = (next: Estimate) => save.mutate(next);
  const collected = INPUT_SPECS.filter((s) => isCollected(docs, s.key)).length;
  const brownfield =
    dpr.stream !== "Greenfield" ||
    e.lines.some((l) => l.section === "dismantling");
  const missingRates = linesMissingRates(e);
  const lineWorks = hasLineWorks(e);
  const abstracts = Object.values(reads.data ?? {}).flat().flatMap((r) => r.abstracts ?? []);
  const checks = crossChecks(dpr, e, contentOf(dpr, e), abstracts);
  const checklist = dprChecklist(e, docs, contentOf(dpr, e), checks);
  const ready = checklist.length === 0;
  const stepDone = (step: StepKey) =>
    step === "generate" ? ready : !checklist.some((g) => g.step === step);
  const stepIndex = STEPS.findIndex((s) => s.key === tab);
  const next = STEPS[stepIndex + 1];

  const download = async () => {
    try {
      await exportEstimate(dpr, e);
    } catch {
      toast({
        title: "Download failed",
        description: "Please try again.",
        tone: "error",
      });
    }
  };
  const startReview = (r: BoqReadResult) => {
    setReviewing(r);
    requestAnimationFrame(() =>
      document
        .getElementById("boq-review-title")
        ?.scrollIntoView?.({ block: "start", behavior: "smooth" }),
    );
  };
  const importLines = (plan: ImportPlan, mode: ImportMode) => {
    change(applyImport(e, plan, mode));
    setTab("estimate");
    toast({
      title: `Imported ${plan.lines.length} items`,
      description: `${reviewing!.fileName} into ${plan.sections.map(sectionLabel).join(", ")}`,
    });
    setReviewing(null);
  };

  const reset = () => {
    change(buildTemplate(dpr));
    setConfirmReset(false);
    toast({ title: "Estimate reset to template", description: dpr.id });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={ready ? "green" : "amber"}>
          {ready ? "Ready to submit" : "In preparation"}
        </Badge>
        <span className="text-xs text-gray-500">
          {dpr.capacity} · {dpr.voltage} · {dpr.stream}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <div
              role="alertdialog"
              aria-label="Confirm reset"
              className="flex items-center gap-2 text-[13px]"
            >
              <span className="text-gray-700">
                Replace all lines with the template?
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={reset}>
                Yes, reset
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset to template
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={download}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download Excel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setTab("generate")}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Generate full DPR
          </button>
        </div>
      </div>

      <SummaryStrip collected={collected} e={e} />

      <nav aria-label="Preparation steps">
        <ol
          role="tablist"
          aria-label="Preparation steps"
          className="flex flex-wrap gap-1 border-b border-gray-200"
        >
          {STEPS.map((t, i) => {
            const done = stepDone(t.key);
            return (
              <li key={t.key} className="flex">
                <button
                  type="button"
                  role="tab"
                  id={`tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  aria-label={t.label}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${done ? "bg-emerald-600 text-white" : tab === t.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {t.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {tab === "inputs" && (
        <div
          role="tabpanel"
          id="panel-inputs"
          aria-labelledby="tab-inputs"
          className="space-y-4"
        >
          <InputsCard
            dprId={dpr.id}
            docs={docs}
            reads={reads.data ?? {}}
            onReview={startReview}
          />
          {reviewing && (
            <BoqReview
              key={`${reviewing.fileName}-${reviewing.readAt}`}
              read={reviewing}
              currentLines={e.lines}
              onCancel={() => setReviewing(null)}
              onImport={importLines}
            />
          )}
        </div>
      )}
      {tab === "estimate" && (
        <div
          role="tabpanel"
          id="panel-estimate"
          aria-labelledby="tab-estimate"
          className="space-y-4"
        >
          {dpr.stream === "Greenfield" &&
            !e.lines.some((l) => l.section !== "dismantling") && (
              <p
                role="status"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-700"
              >
                Greenfield estimates start empty. Attach the electrical and
                civil BOQ workbooks in Documents, then use Review &amp; import
                below, or add items by hand.
              </p>
            )}
          {e.templateCapacity !== `${dpr.capacity} ${dpr.voltage}` && (
            <p
              role="status"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-700"
            >
              This estimate was built for {e.templateCapacity}, but the DPR is
              now {dpr.capacity} {dpr.voltage}. Use “Reset to template” to
              rebuild it.
            </p>
          )}
          {missingRates.length > 0 && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {missingRates.length}{" "}
                {missingRates.length === 1 ? "item needs" : "items need"} a rate
                from the schedule of rates:{" "}
                {missingRates.map((l) => l.code).join(", ")}. The total is
                understated until they are filled in.
              </span>
            </p>
          )}

          <RatePricingCard estimate={e} onChange={change} />
          <BoqTable section="electrical" estimate={e} onChange={change} />
          <BoqTable section="civil" estimate={e} onChange={change} />
          <AbstractCard e={e} part="I" onChange={change} />
          {lineWorks && (
            <>
              <BoqTable section="line" estimate={e} onChange={change} />
              <BoqTable section="lineCivil" estimate={e} onChange={change} />
              <AbstractCard e={e} part="line" onChange={change} />
            </>
          )}
          {brownfield && (
            <>
              <BoqTable section="dismantling" estimate={e} onChange={change} />
              <AbstractCard e={e} part="II" onChange={change} />
            </>
          )}
          <GeneralAbstractCard e={e} brownfield={brownfield} />
        </div>
      )}
      {tab === "finance" && (
        <div
          role="tabpanel"
          id="panel-finance"
          aria-labelledby="tab-finance"
          className="space-y-4"
        >
          <LoadDataCard dpr={dpr} e={e} onChange={change} />
          <CostBenefitCard e={e} onChange={change} capacity={dpr.capacity} />
        </div>
      )}
      {tab === "schedule" && (
        <div role="tabpanel" id="panel-schedule" aria-labelledby="tab-schedule">
          <PertPanel dpr={dpr} estimate={e} onChange={change} />
        </div>
      )}
      {tab === "text" && (
        <div role="tabpanel" id="panel-text" aria-labelledby="tab-text">
          <ReportTextPanel dpr={dpr} estimate={e} onChange={change} documents={docs} />
        </div>
      )}
      {tab === "generate" && (
        <div role="tabpanel" id="panel-generate" aria-labelledby="tab-generate">
          <GenerateDprPanel
            dpr={dpr}
            estimate={e}
            documents={docs}
            checks={checks}
            onChange={change}
            onGoTo={setTab}
          />
        </div>
      )}
      {next && (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setTab(next.key)}
          >
            Next: {next.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Rates are from the Common Schedule of Rates for KPTCL, ESCOMs &amp; PWD
        (Electrical) 2023-24 as used in the Kogali sample DPR. Quantities start
        from a template scaled to the DPR’s capacity until a BOQ workbook is
        imported. Changes save automatically.
      </p>
    </>
  );
}

export function DprPreparationPage() {
  const { dprs, active, choose } = useActiveDpr();
  const rows = dprs.data ?? [];
  const activeId = active?.id ?? "";
  const documents = useDprDocuments(activeId);

  let body;
  if (dprs.isPending) {
    body = (
      <div
        className="h-24 animate-pulse rounded-lg bg-gray-100"
        aria-label="Loading DPRs"
      />
    );
  } else if (rows.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon={FileStack}
          title="No DPRs yet"
          hint="An estimate is prepared for a DPR. Initialize one first, then add its documents."
          action={
            <Link to="/initialization" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              Create your first DPR
            </Link>
          }
        />
      </Card>
    );
  } else if (!active) {
    body = (
      <Card>
        <EmptyState
          icon={Calculator}
          title="Select a DPR"
          hint="Its input documents and the electrical and civil BOQ will appear here."
        />
      </Card>
    );
  } else {
    body = (
      <Workspace
        key={active.id}
        dpr={active}
        docs={documents.data ?? EMPTY_DOCUMENTS}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="DPR Preparation"
        description="Six steps from the collected documents to a complete DPR: inputs, estimate, cost-benefit, PERT schedule, report text, then generate."
      />
      <div className="space-y-4">
        <ActiveDprPicker rows={rows} value={activeId} onChange={choose} />
        {active && <DprSummaryHeader dpr={active} />}
        {body}
      </div>
    </div>
  );
}
