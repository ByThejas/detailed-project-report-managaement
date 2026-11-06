import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';

async function pickFromCombobox(label: RegExp, typed: string, option: string) {
  const box = screen.getByRole('combobox', { name: label });
  await userEvent.click(box);
  await userEvent.type(box, typed);
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('DPR Initialization', () => {
  it('shows an error for every missing required field', async () => {
    renderAt('/initialization');
    await userEvent.click(await screen.findByRole('button', { name: 'Initialize DPR' }));
    expect(await screen.findByText(/Enter the project name/)).toBeInTheDocument();
    expect(screen.getByText('Choose the number of units')).toBeInTheDocument();
    expect(screen.getByText('Enter the location or place')).toBeInTheDocument();
    expect(screen.getByText('Choose a zone')).toBeInTheDocument();
    expect(screen.getByText('Choose a circle')).toBeInTheDocument();
    expect(screen.getByText('Choose a division')).toBeInTheDocument();
  });

  it('opens Circle, Division and Station one level at a time from the real KPTCL tree', async () => {
    renderAt('/initialization');
    expect(await screen.findByRole('combobox', { name: /Circle/ })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Division/ })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Existing station/ })).toBeDisabled();

    await pickFromCombobox(/Zone/, 'bang', 'BANGALORE');
    expect(screen.getByRole('combobox', { name: /Circle/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('combobox', { name: /Circle/ }));
    // Only the circles of the chosen zone are offered.
    expect(screen.getByRole('option', { name: 'BMAZ NORTH' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'HASSAN' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox', { name: /Circle/ }), 'bmaz n');
    await userEvent.click(await screen.findByRole('option', { name: 'BMAZ NORTH' }));
    await pickFromCombobox(/Division/, 'peen', 'PEENYA');
    expect(screen.getByRole('combobox', { name: /Existing station/ })).toBeEnabled();
  });

  it('fills the location from a chosen station when it is still empty', async () => {
    renderAt('/initialization');
    await pickFromCombobox(/Zone/, 'bang', 'BANGALORE');
    await pickFromCombobox(/Circle/, 'bmaz n', 'BMAZ NORTH');
    await pickFromCombobox(/Division/, 'peen', 'PEENYA');
    await pickFromCombobox(/Existing station/, 'abbig', 'ABBIGERE (66 kV)');
    expect(screen.getByLabelText(/Location/)).toHaveValue('ABBIGERE');
  });

  it('updates approval routing from the voltage class', async () => {
    renderAt('/initialization');
    expect(await screen.findByTestId('final-approver')).toHaveTextContent('CGM (Tech) Corporate Office');
    expect(screen.getByTestId('voltage-group')).toHaveTextContent('66/110 kV');
    await userEvent.selectOptions(screen.getByLabelText(/Voltage class/), '220 kV');
    expect(screen.getByTestId('final-approver')).toHaveTextContent('To be confirmed');
  });

  it('creates a line work DPR without a transformer capacity', async () => {
    renderAt('/initialization');
    await userEvent.type(await screen.findByLabelText(/Project name/), '110 kV DC line Channapatna to Ramanagara');
    await userEvent.selectOptions(screen.getByLabelText(/Work type/), 'Line work');
    expect(screen.getByText(/Optional for line work/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Location/), 'Channapatna');
    await pickFromCombobox(/Zone/, 'bang', 'BANGALORE');
    await pickFromCombobox(/Circle/, 'bmaz n', 'BMAZ NORTH');
    await pickFromCombobox(/Division/, 'peen', 'PEENYA');
    await userEvent.click(screen.getByRole('button', { name: 'Initialize DPR' }));
    expect(await screen.findByRole('region', { name: 'DPR initialized' })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('dpr-manager.sample-dprs.v1')!)[0];
    expect(saved).toMatchObject({ workType: 'Line work', capacity: '' });
  });

  it('creates a DPR when the form is valid', async () => {
    renderAt('/initialization');
    await userEvent.type(await screen.findByLabelText(/Project name/), '110/11kV Channapatna New S/S');
    await userEvent.selectOptions(screen.getByLabelText('Number of units'), '2');
    await userEvent.selectOptions(screen.getByLabelText('MVA rating'), '31.5');
    await userEvent.type(screen.getByLabelText(/Location/), 'Channapatna');
    await pickFromCombobox(/Zone/, 'bang', 'BANGALORE');
    await pickFromCombobox(/Circle/, 'bmaz n', 'BMAZ NORTH');
    await pickFromCombobox(/Division/, 'peen', 'PEENYA');
    await userEvent.click(screen.getByRole('button', { name: 'Initialize DPR' }));

    const done = await screen.findByRole('region', { name: 'DPR initialized' });
    expect(within(done).getByText(`DPR/PEE/${new Date().getFullYear()}/0001`)).toBeInTheDocument();
    expect(within(done).getByRole('link', { name: 'View in reports' })).toHaveAttribute(
      'href',
      `/reports?q=${encodeURIComponent(`DPR/PEE/${new Date().getFullYear()}/0001`)}`,
    );

    expect(localStorage.getItem('dpr-manager.sample-dprs.v1')).toContain('2x31.5 MVA');

    // "Initialize another" keeps the zone, circle and division.
    await userEvent.click(within(done).getByRole('button', { name: 'Initialize another' }));
    expect(await screen.findByRole('combobox', { name: /Division/ })).toHaveValue('PEENYA');
    expect(screen.getByLabelText(/Project name/)).toHaveValue('');
  });

  it('warns when the approver for the voltage class is not confirmed', async () => {
    renderAt('/initialization');
    await userEvent.selectOptions(await screen.findByLabelText(/Voltage class/), '400 kV');
    expect(screen.getByText(/approver for 400 kV is not confirmed/)).toBeInTheDocument();
  });
});
