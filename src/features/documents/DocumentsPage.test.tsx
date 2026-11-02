import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { ALL_DOCUMENTS } from './catalog';

const pickDpr = async (typed: string) => {
  const box = await screen.findByRole('combobox', { name: 'Active DPR' });
  await userEvent.click(box);
  await userEvent.type(box, typed);
  await userEvent.click(await screen.findByRole('option', { name: /DPR\/PEE\/2026\/0001/ }));
};

const attach = async (docName: string) => {
  const input = screen.getAllByTestId(/-file-input$/).find((el) => el.closest('[role="region"]')?.contains(screen.getByRole('button', { name: `Add files to ${docName}` })))!;
  await userEvent.click(screen.getByRole('button', { name: `Add files to ${docName}` }));
  await userEvent.upload(input, new File(['x'], `${docName}.pdf`, { type: 'application/pdf' }));
};

describe('Documents', () => {
  it('asks to create a DPR first when none exist', async () => {
    renderAt('/documents');
    expect(await screen.findByText('No DPRs yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first DPR' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Active DPR' })).toBeDisabled();
  });

  it('shows no tables until a DPR is chosen, then lists every document', async () => {
    seed([row()]);
    renderAt('/documents');
    expect(await screen.findByText('Select a DPR')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await pickDpr('channa');
    const summary = screen.getByRole('region', { name: 'Document summary' });
    expect(within(summary).getByText('Not ready').parentElement).toHaveTextContent(String(ALL_DOCUMENTS.length));
    // Core, statutory, compensation, and the DPR's own additional documents.
    expect(screen.getAllByRole('table')).toHaveLength(4);
    const core = screen.getByRole('region', { name: 'Core documents' });
    expect(within(core).getAllByRole('row')).toHaveLength(14 + 1);
    expect(within(core).getByText('Earth-Mat Design').closest('tr')).toHaveTextContent('R&D');
    expect(screen.getByRole('button', { name: 'Submit to Consultant' })).toBeDisabled();
  });

  it('opens the DPR named in the URL and filters a table', async () => {
    seed([row()]);
    renderAt('/documents?dpr=DPR%2FPEE%2F2026%2F0001');
    const header = await screen.findByRole('region', { name: 'Selected DPR' });
    expect(within(header).getByRole('heading', { name: '110/11kV Channapatna New S/S' })).toBeInTheDocument();
    for (const fact of ['DPR/PEE/2026/0001', 'Greenfield', '110 kV', '1x16 MVA', 'PEENYA', 'CGM (Tech) Corporate Office']) expect(within(header).getByText(fact)).toBeInTheDocument();
    const statutory = await screen.findByRole('region', { name: 'Statutory documents' });
    await userEvent.type(within(statutory).getByRole('searchbox'), 'railway');
    expect(within(statutory).getAllByRole('row')).toHaveLength(2);
    await userEvent.clear(within(statutory).getByRole('searchbox'));
    await userEvent.type(within(statutory).getByRole('searchbox'), 'zzz');
    expect(within(statutory).getByText('No results')).toBeInTheDocument();
  });

  it('updates status and counts when a file is attached, and can mark optional documents N/A', async () => {
    seed([row()]);
    renderAt('/documents?dpr=DPR%2FPEE%2F2026%2F0001');
    await screen.findByRole('region', { name: 'Core documents' });
    await attach('Land Records');
    const core = screen.getByRole('region', { name: 'Core documents' });
    expect(within(core).getByText('Land Records').closest('tr')).toHaveTextContent('Uploaded');
    const summary = screen.getByRole('region', { name: 'Document summary' });
    expect(within(summary).getByText('Uploaded').parentElement).toHaveTextContent('1');

    await userEvent.click(within(core).getByRole('button', { name: 'TAC: 0 files' }));
    await userEvent.click(within(core).getByRole('button', { name: 'Mark as not applicable' }));
    expect(within(core).getByText('TAC').closest('tr')).toHaveTextContent('N/A');
    expect(within(summary).getByText('N/A').parentElement).toHaveTextContent('1');
  });

  it('submits to the consultant once every mandatory document has a file, then still allows changes and an update', async () => {
    seed([row()]);
    renderAt('/documents?dpr=DPR%2FPEE%2F2026%2F0001');
    await screen.findByRole('region', { name: 'Core documents' });
    const submit = screen.getByRole('button', { name: 'Submit to Consultant' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/7 mandatory documents still needed/)).toBeInTheDocument();

    for (const d of ALL_DOCUMENTS.filter((x) => x.requirement === 'Mandatory')) await attach(d.name);
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByText(/You can still add, remove or change documents/)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Document summary' });
    expect(within(summary).getByText('Pending').parentElement).toHaveTextContent('7');
    const again = screen.getByRole('button', { name: 'Send update to Consultant' });
    expect(again).toBeDisabled();

    // A document of its own for this DPR, then a file in it.
    const extra = screen.getByRole('region', { name: 'Additional documents' });
    await userEvent.type(within(extra).getByRole('textbox', { name: 'New document name' }), 'Forest NOC');
    await userEvent.click(within(extra).getByRole('button', { name: 'Add document' }));
    expect(await within(extra).findByText('Forest NOC')).toBeInTheDocument();
    await attach('Forest NOC');
    const changes = await screen.findByRole('list', { name: 'Changes since the last submission' });
    expect(changes).toHaveTextContent('Added document “Forest NOC”');
    expect(changes).toHaveTextContent('Added Forest NOC.pdf to Forest NOC');
    expect(again).toBeEnabled();
    await userEvent.click(again);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, send update' }));
    expect(await screen.findByText(/2 submissions/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changes since the last submission' })).not.toBeInTheDocument();
  });
});
