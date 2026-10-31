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
    expect(screen.getByText('Use the form 1x16 MVA')).toBeInTheDocument();
    expect(screen.getByText('Enter the location or place')).toBeInTheDocument();
    expect(screen.getByText('Choose a circle')).toBeInTheDocument();
    expect(screen.getByText('Choose a division')).toBeInTheDocument();
  });

  it('keeps Division disabled until a circle is chosen', async () => {
    renderAt('/initialization');
    expect(await screen.findByRole('combobox', { name: /Division/ })).toBeDisabled();
    await pickFromCombobox(/Circle/, 'Beng', 'Bengaluru Circle');
    expect(screen.getByRole('combobox', { name: /Division/ })).toBeEnabled();
  });

  it('updates approval routing from the voltage class', async () => {
    renderAt('/initialization');
    expect(await screen.findByTestId('final-approver')).toHaveTextContent('CGM (Tech) Corporate Office');
    expect(screen.getByTestId('voltage-group')).toHaveTextContent('66/110 kV');
    await userEvent.selectOptions(screen.getByLabelText(/Voltage class/), '220 kV');
    expect(screen.getByTestId('final-approver')).toHaveTextContent('To be confirmed');
  });

  it('creates a DPR when the form is valid', async () => {
    renderAt('/initialization');
    await userEvent.type(await screen.findByLabelText(/Project name/), '110/11kV Channapatna New S/S');
    await userEvent.type(screen.getByLabelText(/Capacity/), '1x16 MVA');
    await userEvent.type(screen.getByLabelText(/Location/), 'Channapatna');
    await pickFromCombobox(/Circle/, 'Beng', 'Bengaluru Circle');
    await pickFromCombobox(/Division/, 'Ali', 'Alipura');
    await userEvent.click(screen.getByRole('button', { name: 'Initialize DPR' }));

    const done = await screen.findByRole('region', { name: 'DPR initialized' });
    expect(within(done).getByText(`DPR/ALI/${new Date().getFullYear()}/0001`)).toBeInTheDocument();
    expect(within(done).getByRole('link', { name: 'View in reports' })).toHaveAttribute(
      'href',
      `/reports?q=${encodeURIComponent(`DPR/ALI/${new Date().getFullYear()}/0001`)}`,
    );

    // "Initialize another" keeps the circle and division.
    await userEvent.click(within(done).getByRole('button', { name: 'Initialize another' }));
    expect(await screen.findByRole('combobox', { name: /Division/ })).toHaveValue('Alipura');
    expect(screen.getByLabelText(/Project name/)).toHaveValue('');
  });

  it('warns when the approver for the voltage class is not confirmed', async () => {
    renderAt('/initialization');
    await userEvent.selectOptions(await screen.findByLabelText(/Voltage class/), '400 kV');
    expect(screen.getByText(/approver for 400 kV is not confirmed/)).toBeInTheDocument();
  });
});
