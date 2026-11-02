import 'fake-indexeddb/auto';
import { deleteFile, getFile, putFiles } from './fileStore';

describe('attached file store', () => {
  it('keeps a file by DPR, document and name, replaces it by name, and deletes it', async () => {
    await putFiles('D1', 'grid-map', [new File(['first'], 'grid.pdf', { type: 'application/pdf' })]);
    await putFiles('D1', 'grid-map', [new File(['second'], 'grid.pdf', { type: 'application/pdf' })]);
    const f = await getFile('D1', 'grid-map', 'grid.pdf');
    expect(f?.type).toBe('application/pdf');
    expect(new TextDecoder().decode(f!.data)).toBe('second');
    expect(await getFile('D2', 'grid-map', 'grid.pdf')).toBeUndefined();
    await deleteFile('D1', 'grid-map', 'grid.pdf');
    expect(await getFile('D1', 'grid-map', 'grid.pdf')).toBeUndefined();
  });
});
