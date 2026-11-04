import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { sampleStore } from '@/lib/sampleStore';

const KOGALI = row({ id: 'DPR/PEE/2026/0001', project: '66/11kV Kogali S/S', voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });
const url = `/preparation?dpr=${encodeURIComponent(KOGALI.id)}`;
const openStep = async (name: string) => userEvent.click(await screen.findByRole('tab', { name }));

describe('DPR Preparation', () => {
  it('asks to create a DPR first when none exist', async () => {
    renderAt('/preparation');
    expect(await screen.findByText('No DPRs yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first DPR' })).toBeInTheDocument();
  });

  it('waits for a DPR to be chosen', async () => {
    seed([KOGALI]);
    renderAt('/preparation');
    expect(await screen.findByText('Select a DPR')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('builds the BOQ from the DPR capacity and lists the nine input documents', async () => {
    seed([KOGALI]);
    renderAt(url);
    const inputs = await screen.findByRole('region', { name: 'Input documents' });
    expect(within(inputs).getAllByRole('listitem')).toHaveLength(9);
    expect(within(inputs).getByText('TCCM Proposal')).toBeInTheDocument();
    expect(within(inputs).getAllByText('Missing')).toHaveLength(9);
    expect(screen.getByText('In preparation')).toBeInTheDocument();
    expect(screen.queryByText(/This estimate was built for/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('0 / 9')).toBeInTheDocument();

    await openStep('Estimate');
    const electrical = screen.getByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(electrical).getByDisplayValue(/Power transformer 20 MVA, 66\/11 kV/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Civil BOQ (Part B)' })).toBeInTheDocument();
  });

  it('shows files attached in Documents', async () => {
    seed([KOGALI]);
    sampleStore.saveDocuments(KOGALI.id, {
      files: { 'single-line-diagram-sld': [{ name: 'kogali-sld.pdf', size: 10, addedAt: '2026-10-31T09:00:00.000Z' }] },
      notApplicable: ['scada-sas-details'],
    });
    renderAt(url);
    const inputs = await screen.findByRole('region', { name: 'Input documents' });
    expect(within(inputs).getByText('kogali-sld.pdf')).toBeInTheDocument();
    expect(within(inputs).getByText('Not applicable')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('2 / 9')).toBeInTheDocument();
  });

  it('adds the dismantling estimate and Abstract-II for a brownfield DPR only', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('Estimate');
    expect(await screen.findByRole('region', { name: 'Dismantling (Abstract-II)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Abstract-II' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'General abstract' })).getByText('Dismantling of the existing equipment (Abstract-II)')).toBeInTheDocument();
  });

  it('starts a greenfield DPR empty with no dismantling', async () => {
    seed([row({ ...KOGALI, stream: 'Greenfield' })]);
    renderAt(url);
    await openStep('Estimate');
    expect(await screen.findByRole('region', { name: 'General abstract' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Abstract-II' })).not.toBeInTheDocument();
    expect(screen.getByText(/Greenfield estimates start empty/)).toBeInTheDocument();
  });

  it('prices a BOQ item from the rate catalog only after the match is ticked', async () => {
    seed([row({ ...KOGALI, capacity: '1x12.5 MVA', voltage: '110 kV' })]);
    renderAt(url);
    await openStep('Estimate');
    const card = screen.getByRole('region', { name: 'Price from the rate catalog' });
    await userEvent.click(within(card).getByRole('button', { name: 'Find rates' }));
    const table = await within(card).findByRole('table', { name: 'Rate suggestions' }, { timeout: 8000 });
    const apply = within(card).getByRole('button', { name: /^Apply rates to 0 items/ });
    expect(apply).toBeDisabled();
    // Take the exact SoR item by code: 1.11 is the 12.5 MVA, 66/11 kV transformer.
    await userEvent.selectOptions(within(table).getAllByRole('combobox')[0]!, 'SoR code typed by hand…');
    await userEvent.type(within(table).getByRole('textbox', { name: /SoR code for/ }), '1.11');
    expect(within(table).getByText(/By code 1\.11/)).toBeInTheDocument();
    await userEvent.click(within(table).getAllByRole('checkbox')[0]!);
    await userEvent.click(within(card).getByRole('button', { name: 'Apply rates to 1 item' }));
    const electrical = screen.getByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(electrical).getAllByRole('spinbutton', { name: /Supply rate/ })[0]).toHaveValue(20_715_000);
    expect(within(electrical).getByText(/Rates: SoR 2023-24 · By code 1\.11/)).toBeInTheDocument();
  });

  it('works out B/C ratio, IRR and payback the KPTCL way from the BCR inputs', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('Cost-benefit');
    const cba = screen.getByRole('region', { name: 'Cost-benefit analysis' });
    expect(within(cba).getByText('Benefit-cost ratio').nextElementSibling).toHaveTextContent('—');
    await userEvent.click(within(cba).getByRole('button', { name: 'Use 40 MVA' }));
    expect(within(cba).getByRole('spinbutton', { name: 'Additional load after enhancement' })).toHaveValue(40);
    expect(within(cba).getByText('Benefit-cost ratio').nextElementSibling).not.toHaveTextContent('—');
  });

  it('works out B/C ratio, IRR and payback from benefits pasted from the BCR sheet', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('Cost-benefit');
    await userEvent.click(screen.getByRole('radio', { name: 'Enter yearly benefits by hand' }));
    const cba = screen.getByRole('region', { name: 'Cost-benefit analysis' });
    await userEvent.click(within(cba).getByRole('textbox'));
    await userEvent.paste('300\t300\t300\t300\tn/a');
    await userEvent.click(within(cba).getByRole('button', { name: 'Fill years from pasted values' }));
    expect(within(cba).getByRole('status')).toHaveTextContent('Filled years 1–4 from 4 values. Expected 30; check nothing is missing or extra. Ignored text: n/a.');
    expect(within(cba).getByRole('spinbutton', { name: 'Benefit year 4' })).toHaveValue(300);
    expect(within(cba).getByText('Payback').nextElementSibling).toHaveTextContent('3 years');
  });

  it('lists what keeps the DPR a draft, by step, and updates as text is written', async () => {
    seed([KOGALI]);
    renderAt(url);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate full DPR' }));
    const panel = screen.getByRole('region', { name: 'Generate full DPR' });
    expect(within(panel).getByRole('button', { name: 'Generate draft DPR (Word)' })).toBeInTheDocument();
    const missing = screen.getByRole('region', { name: 'Still missing' });
    expect(within(missing).getByText('TCCM Proceedings')).toBeInTheDocument();
    expect(within(missing).queryByText('TCCM Proposal')).not.toBeInTheDocument();
    expect(within(missing).getByText('Existing capacity')).toBeInTheDocument();
    expect(within(missing).getByText('BCR inputs (additional MVA)')).toBeInTheDocument();
    const outline = screen.getByRole('region', { name: 'What goes into the DPR' });
    expect(within(outline).getByText('PERT chart')).toBeInTheDocument();
    expect(within(outline).getByText('R&D earthmat design report')).toBeInTheDocument();

    await openStep('Report text');
    await userEvent.type(screen.getByRole('textbox', { name: 'Existing capacity' }), '2x8 MVA, 66/11 kV');
    await openStep('Generate DPR');
    expect(within(screen.getByRole('region', { name: 'Still missing' })).queryByText('Existing capacity')).not.toBeInTheDocument();
  });

  it('edits the PERT stages and flags a chart that overruns the completion period', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('PERT schedule');
    const pert = screen.getByRole('region', { name: 'PERT chart' });
    expect(within(pert).getByDisplayValue('Stage-III')).toBeInTheDocument();
    const months = within(pert).getByRole('spinbutton', { name: 'Stage-III months' });
    await userEvent.clear(months);
    await userEvent.type(months, '9');
    expect(within(pert).getByRole('status')).toHaveTextContent('stages run to M14, past the 6-month completion period');
  });

  it('recalculates the abstract when a quantity changes and keeps the edit', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('Estimate');
    const abstract = await screen.findByRole('region', { name: 'Abstract-I' });
    const totalRow = () => within(abstract).getByText('Total estimate cost (7 to 10)').closest('tr')!;
    const before = totalRow().textContent;

    const electrical = screen.getByRole('region', { name: 'Electrical BOQ (Part A)' });
    const qty = within(electrical).getAllByRole('spinbutton', { name: /Quantity/ })[0]!;
    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    expect(totalRow().textContent).not.toBe(before);
    cleanup();

    renderAt(url);
    await openStep('Estimate');
    const again = await screen.findByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(again).getAllByRole('spinbutton', { name: /Quantity/ })[0]).toHaveValue(3);
  });

  it('flags items without a rate and resets to the template after confirming', async () => {
    seed([row({ ...KOGALI, capacity: '1x12.5 MVA', voltage: '110 kV' })]);
    renderAt(url);
    await openStep('Estimate');
    expect(await screen.findByText(/needs a rate from the schedule of rates: A1 a/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset to template' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm reset' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, reset' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('works out loading from the load data, feeds the BCR, and checks the DPR agrees with itself', async () => {
    seed([KOGALI]);
    renderAt(url);
    await openStep('Cost-benefit');
    const load = screen.getByRole('region', { name: 'Load data' });
    await userEvent.type(within(load).getByRole('textbox'), '2x8 MVA');
    await userEvent.type(within(load).getByRole('spinbutton', { name: 'Recorded peak load (MW)' }), '5.8');
    await userEvent.clear(within(load).getByRole('spinbutton', { name: 'Capacity replaced (MVA)' }));
    await userEvent.type(within(load).getByRole('spinbutton', { name: 'Capacity replaced (MVA)' }), '16');
    expect(within(load).getByRole('status', { name: 'Loading factor' })).toHaveTextContent('Now: 0.42 on 16 MVA');
    await userEvent.click(within(load).getByRole('button', { name: 'Use 24 MVA for the BCR' }));
    expect(screen.getByRole('spinbutton', { name: 'Additional load after enhancement' })).toHaveValue(24);
    await userEvent.click(within(load).getByRole('button', { name: 'Fill section 01 facts' }));

    await openStep('Report text');
    expect(screen.getByDisplayValue('2×8 MVA — recorded peak load 5.8 MW, loading factor 0.42 (within capacity)')).toBeInTheDocument();
    const mva = screen.getByDisplayValue(/^24 MVA \(2×20 MVA\)/);
    await userEvent.clear(mva);
    await userEvent.type(mva, '2x12.5 MVA');

    await openStep('Generate DPR');
    const checks = screen.getByRole('region', { name: 'Consistency checks' });
    expect(within(checks).getByText('“MVA added” mentions 12.5 MVA, but the DPR is for 2x20 MVA.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Still missing' })).getByText(/MVA added” mentions 12.5 MVA/)).toBeInTheDocument();
    await userEvent.click(within(checks).getByRole('button', { name: 'It is correct…' }));
    await userEvent.type(within(checks).getByRole('textbox', { name: 'Why this is correct' }), 'old units named on purpose');
    await userEvent.click(within(checks).getByRole('button', { name: 'Accept' }));
    expect(within(checks).getByText('Accepted: old units named on purpose')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Version history' })).getByText(/No DPR generated yet/)).toBeInTheDocument();
  });
});
