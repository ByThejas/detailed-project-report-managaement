import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Num } from './EstimatePdfEditor';

function Box({ min = 6, max = 300, start = 14 }: { min?: number; max?: number; start?: number }) {
  const [v, setV] = useState(start);
  return (
    <>
      <Num label="Row height (pt)" value={v} min={min} max={max} onChange={setV} />
      <output>{v}</output>
    </>
  );
}

describe('number boxes in the PDF editor', () => {
  it('takes a number typed digit by digit, even when the first digit is under the minimum', async () => {
    render(<Box />);
    const box = screen.getByLabelText('Row height (pt)');
    await userEvent.clear(box);
    await userEvent.type(box, '12');
    expect(box).toHaveValue(12);
    expect(screen.getByRole('status')).toHaveTextContent('12');
    await userEvent.tab();
    expect(screen.getByRole('status')).toHaveTextContent('12');
  });

  it('brings a number out of range within range when the box is left, and keeps the value for an empty box', async () => {
    render(<Box />);
    const box = screen.getByLabelText('Row height (pt)');
    await userEvent.clear(box);
    await userEvent.type(box, '2{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('6');
    expect(box).toHaveValue(6);
    await userEvent.clear(box);
    await userEvent.tab();
    expect(box).toHaveValue(6);
  });

  it('takes decimals such as 8.5', async () => {
    render(<Box min={4} max={40} start={9} />);
    const box = screen.getByLabelText('Row height (pt)');
    await userEvent.clear(box);
    await userEvent.type(box, '8.5');
    await userEvent.tab();
    expect(screen.getByRole('status')).toHaveTextContent('8.5');
  });
});
