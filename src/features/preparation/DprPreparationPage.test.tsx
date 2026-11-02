import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { sampleStore } from '@/lib/sampleStore';

const KOGALI = row({ id: 'DPR/PEE/2026/0001', project: '66/11kV Kogali S/S', voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });
const url = `/preparation?dpr=${encodeURIComponent(KOGALI.id)}`;

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

  it('builds the BOQ from the DPR capacity and lists the ten input documents', async () => {
    seed([KOGALI]);
    renderAt(url);
    const electrical = await screen.findByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(electrical).getByDisplayValue(/Power transformer 20 MVA, 66\/11 kV/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Civil BOQ (Part B)' })).toBeInTheDocument();

    const inputs = screen.getByRole('region', { name: 'Input documents' });
    expect(within(inputs).getAllByRole('listitem')).toHaveLength(10);
    expect(within(inputs).getByText('TCCM Proposal')).toBeInTheDocument();
    expect(within(inputs).getAllByText('Missing')).toHaveLength(10);
    expect(screen.getByText('In preparation')).toBeInTheDocument();
    expect(screen.queryByText(/This estimate was built for/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('0 / 10')).toBeInTheDocument();
  });

  it('shows files attached in Documents', async () => {
    seed([KOGALI]);
    sampleStore.saveDocuments(KOGALI.id, {
      files: { 'single-line-diagram-sld': [{ name: 'kogali-sld.pdf', size: 10, addedAt: '2026-10-31T09:00:00.000Z' }] },
      notApplicable: ['bill-of-quantity-civil'],
    });
    renderAt(url);
    const inputs = await screen.findByRole('region', { name: 'Input documents' });
    expect(within(inputs).getByText('kogali-sld.pdf')).toBeInTheDocument();
    expect(within(inputs).getByText('Not applicable')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Estimate summary' })).getByText('2 / 10')).toBeInTheDocument();
  });

  it('adds the dismantling estimate and Abstract-II for a brownfield DPR only', async () => {
    seed([KOGALI]);
    renderAt(url);
    expect(await screen.findByRole('region', { name: 'Dismantling (Abstract-II)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Abstract-II' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'General abstract' })).getByText('Dismantling of the existing equipment (Abstract-II)')).toBeInTheDocument();
  });

  it('starts a greenfield DPR empty with no dismantling', async () => {
    seed([row({ ...KOGALI, stream: 'Greenfield' })]);
    renderAt(url);
    expect(await screen.findByRole('region', { name: 'General abstract' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Abstract-II' })).not.toBeInTheDocument();
    expect(screen.getByText(/Greenfield estimates start empty/)).toBeInTheDocument();
  });

  it('works out B/C ratio, IRR and payback from benefits pasted from the BCR sheet', async () => {
    seed([KOGALI]);
    renderAt(url);
    await userEvent.click(await screen.findByRole('tab', { name: 'Cost-benefit' }));
    const cba = screen.getByRole('region', { name: 'Cost-benefit analysis' });
    await userEvent.click(within(cba).getByRole('textbox'));
    await userEvent.paste('300\t300\t300\t300\tn/a');
    await userEvent.click(within(cba).getByRole('button', { name: 'Fill years from pasted values' }));
    expect(within(cba).getByRole('status')).toHaveTextContent('Filled years 1–4 from 4 values. Expected 30; check nothing is missing or extra. Ignored text: n/a.');
    expect(within(cba).getByRole('spinbutton', { name: 'Benefit year 4' })).toHaveValue(300);
    expect(within(cba).getByText('Payback').nextElementSibling).toHaveTextContent('3 years');
  });

  it('lists what keeps the Word DPR a draft and updates as text is written', async () => {
    seed([KOGALI]);
    renderAt(url);
    await userEvent.click(await screen.findByRole('tab', { name: 'DPR document' }));
    const panel = screen.getByRole('region', { name: 'DPR document (Word)' });
    expect(within(panel).getByRole('button', { name: 'Download draft (Word)' })).toBeInTheDocument();
    expect(within(panel).getByText('document: TCCM Proposal')).toBeInTheDocument();
    expect(within(panel).getByText('text: Existing capacity')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Existing capacity' }), '2x8 MVA, 66/11 kV');
    expect(within(panel).queryByText('text: Existing capacity')).not.toBeInTheDocument();
  });

  it('recalculates the abstract when a quantity changes and keeps the edit', async () => {
    seed([KOGALI]);
    renderAt(url);
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
    const again = await screen.findByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(again).getAllByRole('spinbutton', { name: /Quantity/ })[0]).toHaveValue(3);
  });

  it('flags items without a rate and resets to the template after confirming', async () => {
    seed([row({ ...KOGALI, capacity: '1x12.5 MVA', voltage: '110 kV' })]);
    renderAt(url);
    expect(await screen.findByText(/needs a rate from the schedule of rates: A1 a/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset to template' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm reset' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, reset' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
