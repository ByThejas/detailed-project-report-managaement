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
    expect(screen.getAllByRole('table')).toHaveLength(3);
    const core = screen.getByRole('region', { name: 'Core documents' });
    expect(within(core).getAllByRole('row')).toHaveLength(15 + 1);
    expect(within(core).getByText('Earth-Mat Design').closest('tr')).toHaveTextContent('R&D');
    expect(screen.getByRole('button', { name: 'Submit to Consultant' })).toBeDisabled();
  });

  it('opens the DPR named in the URL and filters a table', async () => {
    seed([row()]);
    renderAt('/documents?dpr=DPR%2FPEE%2F2026%2F0001');
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

  it('submits to the consultant only after every mandatory document has a file, then locks', async () => {
    seed([row()]);
    renderAt('/documents?dpr=DPR%2FPEE%2F2026%2F0001');
    await screen.findByRole('region', { name: 'Core documents' });
    const submit = screen.getByRole('button', { name: 'Submit to Consultant' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/8 mandatory documents still needed/)).toBeInTheDocument();

    for (const d of ALL_DOCUMENTS.filter((x) => x.requirement === 'Mandatory')) await attach(d.name);
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByText(/Files can no longer be changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit to Consultant' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add files to TAC' })).toBeDisabled();
    const summary = screen.getByRole('region', { name: 'Document summary' });
    expect(within(summary).getByText('Pending').parentElement).toHaveTextContent('8');
  });
});
