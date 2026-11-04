import type { Cell, SheetGrid } from './types';

/**
 * Reads an old Excel 97–2003 workbook (.xls, BIFF8) into the same grids as `workbookToGrids`, with no
 * library: cell values only (text, numbers, the saved results of formulas), hidden sheets and rows, and
 * merged cells kept only in their top-left cell. Throws on anything it can't read (password-protected,
 * Excel 5 or older, or not an .xls at all).
 */
export function xlsToGrids(buffer: ArrayBuffer): SheetGrid[] {
  const stream = cfbStream(new Uint8Array(buffer), 'Workbook');
  return readBiff8(stream);
}

// ---------------------------------------------------------------------------------------------------
// Compound File (OLE2) container: finds a stream by name.

const FREE = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

function cfbStream(bytes: Uint8Array, name: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (bytes.length < 512 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error('Not an Excel 97–2003 workbook');
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const firstDirSector = view.getUint32(0x30, true);
  const miniCutoff = view.getUint32(0x38, true);
  const firstMiniFat = view.getUint32(0x3c, true);
  let difatSector = view.getUint32(0x44, true);
  const sectorOffset = (s: number) => (s + 1) * sectorSize;

  // The FAT's own sectors are listed in the header (first 109) and then in a chain of DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getUint32(0x4c + i * 4, true);
    if (s !== FREE) fatSectors.push(s);
  }
  const perSector = sectorSize / 4;
  for (let guard = 0; difatSector !== END_OF_CHAIN && difatSector !== FREE && guard < 1 << 20; guard++) {
    const off = sectorOffset(difatSector);
    for (let i = 0; i < perSector - 1; i++) {
      const s = view.getUint32(off + i * 4, true);
      if (s !== FREE) fatSectors.push(s);
    }
    difatSector = view.getUint32(off + (perSector - 1) * 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const off = sectorOffset(s);
    for (let i = 0; i < perSector && off + i * 4 + 4 <= bytes.length; i++) fat.push(view.getUint32(off + i * 4, true));
  }

  const chain = (start: number, next: number[]) => {
    const out: number[] = [];
    for (let s = start; s !== END_OF_CHAIN && s !== FREE && s < next.length; s = next[s]!) {
      out.push(s);
      if (out.length > next.length) throw new Error('Damaged workbook (sector loop)');
    }
    return out;
  };
  const readChain = (start: number, size: number) => {
    const out = new Uint8Array(size);
    let pos = 0;
    for (const s of chain(start, fat)) {
      if (pos >= size) break;
      const off = sectorOffset(s);
      const n = Math.min(sectorSize, size - pos, bytes.length - off);
      if (n <= 0) break;
      out.set(bytes.subarray(off, off + n), pos);
      pos += n;
    }
    return out;
  };

  // Directory: 128-byte entries. Entry 0 is the root, whose data is the mini stream for small streams.
  const dirSectors = chain(firstDirSector, fat);
  const dir = readChain(firstDirSector, dirSectors.length * sectorSize);
  const dv = new DataView(dir.buffer);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const len = dv.getUint16(off + 0x40, true);
    let n = '';
    for (let i = 0; i + 2 < len && i < 64; i += 2) n += String.fromCharCode(dv.getUint16(off + i, true));
    entries.push({ name: n, type: dir[off + 0x42]!, start: dv.getUint32(off + 0x74, true), size: dv.getUint32(off + 0x78, true) });
  }
  const root = entries[0];
  const entry = entries.find((e) => e.type === 2 && e.name.toLowerCase() === name.toLowerCase());
  if (!root || !entry) {
    if (entries.some((e) => e.type === 2 && e.name === 'Book')) throw new Error('Excel 5.0 workbook: save it as .xlsx');
    if (entries.some((e) => e.name === 'EncryptedPackage')) throw new Error('Password-protected workbook');
    throw new Error('No workbook inside the file');
  }
  if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);

  // Small stream: 64-byte mini sectors inside the root's data, chained by the mini FAT.
  const miniStream = readChain(root.start, root.size);
  const miniFatBytes = readChain(firstMiniFat, chain(firstMiniFat, fat).length * sectorSize);
  const mfv = new DataView(miniFatBytes.buffer);
  const miniFat = Array.from({ length: miniFatBytes.length / 4 }, (_, i) => mfv.getUint32(i * 4, true));
  const out = new Uint8Array(entry.size);
  let pos = 0;
  for (const s of chain(entry.start, miniFat)) {
    if (pos >= entry.size) break;
    const n = Math.min(miniSectorSize, entry.size - pos);
    out.set(miniStream.subarray(s * miniSectorSize, s * miniSectorSize + n), pos);
    pos += n;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// BIFF8 records.

const R = {
  BOF: 0x0809,
  EOF: 0x000a,
  FILEPASS: 0x002f,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  CONTINUE: 0x003c,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
  ROW: 0x0208,
  MERGEDCELLS: 0x00e5,
} as const;

const ERRORS: Record<number, string> = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0f: '#VALUE!', 0x17: '#REF!', 0x1d: '#NAME?', 0x24: '#NUM!', 0x2a: '#N/A' };

/** A record's data, with any CONTINUE records that follow it kept as separate parts. */
interface Rec {
  type: number;
  offset: number;
  parts: Uint8Array[];
}

function records(stream: Uint8Array): Rec[] {
  const out: Rec[] = [];
  const v = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  for (let p = 0; p + 4 <= stream.length; ) {
    const type = v.getUint16(p, true);
    const len = v.getUint16(p + 2, true);
    const data = stream.subarray(p + 4, Math.min(p + 4 + len, stream.length));
    const last = out[out.length - 1];
    if (type === R.CONTINUE && last) last.parts.push(data);
    else out.push({ type, offset: p, parts: [data] });
    p += 4 + len;
  }
  return out;
}

/** Reads across a record and its CONTINUE parts; a string that runs into a new part restarts with a flags byte. */
class PartReader {
  private i = 0;
  private o = 0;
  constructor(private parts: Uint8Array[]) {}
  private get part() {
    while (this.i < this.parts.length && this.o >= this.parts[this.i]!.length) {
      this.i++;
      this.o = 0;
    }
    return this.parts[this.i];
  }
  get done() {
    return !this.part;
  }
  u8() {
    const p = this.part;
    if (!p) throw new Error('Unexpected end of record');
    return p[this.o++]!;
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    for (let k = 0; k < n; k++) this.u8();
  }
  /** An XLUnicodeRichExtendedString (SST entries) or, with rich/ext off, an XLUnicodeString. */
  string(): string {
    const cch = this.u16();
    const flags = this.u8();
    let high = (flags & 0x01) !== 0;
    const runs = flags & 0x08 ? this.u16() : 0;
    const ext = flags & 0x04 ? this.u32() : 0;
    let s = '';
    for (let left = cch; left > 0; ) {
      const p = this.part;
      if (!p) break;
      if (this.o >= p.length) continue;
      const room = Math.floor((p.length - this.o) / (high ? 2 : 1));
      const n = Math.min(left, room);
      for (let k = 0; k < n; k++) s += String.fromCharCode(high ? p[this.o + 2 * k]! | (p[this.o + 2 * k + 1]! << 8) : p[this.o + k]!);
      this.o += n * (high ? 2 : 1);
      left -= n;
      if (left > 0) {
        // The characters continue in the next part, which starts with its own flags byte.
        this.o = p.length;
        if (!this.part) break;
        high = (this.u8() & 0x01) !== 0;
      }
    }
    this.skip(runs * 4 + ext);
    return s;
  }
}

const rk = (v: number): number => {
  let n: number;
  if (v & 0x02) n = v >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, v & 0xfffffffc, true);
    n = buf.getFloat64(0, true);
  }
  return v & 0x01 ? n / 100 : n;
};

function readBiff8(stream: Uint8Array): SheetGrid[] {
  const recs = records(stream);
  const first = recs[0];
  if (!first || first.type !== R.BOF) throw new Error('Not an Excel 97–2003 workbook');
  const bofVersion = new DataView(first.parts[0]!.buffer, first.parts[0]!.byteOffset).getUint16(0, true);
  if (bofVersion !== 0x0600) throw new Error('Excel 5.0 or older workbook: save it as .xlsx');

  const sheets: { name: string; hidden: boolean; offset: number; isWorksheet: boolean }[] = [];
  let sst: string[] = [];
  let i = 1;
  for (; i < recs.length && recs[i]!.type !== R.EOF; i++) {
    const r = recs[i]!;
    if (r.type === R.FILEPASS) throw new Error('Password-protected workbook');
    if (r.type === R.BOUNDSHEET) {
      const d = r.parts[0]!;
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      const cch = d[6]!;
      const high = (d[7]! & 1) !== 0;
      let name = '';
      for (let k = 0; k < cch; k++) name += String.fromCharCode(high ? dv.getUint16(8 + 2 * k, true) : d[8 + k]!);
      sheets.push({ name, hidden: d[4]! !== 0, offset: dv.getUint32(0, true), isWorksheet: d[5]! === 0 });
    }
    if (r.type === R.SST) {
      const rd = new PartReader(r.parts);
      rd.u32();
      const unique = rd.u32();
      sst = [];
      for (let k = 0; k < unique && !rd.done; k++) sst.push(rd.string());
    }
  }

  const byOffset = new Map(recs.map((r, k) => [r.offset, k]));
  return sheets
    .filter((s) => s.isWorksheet)
    .map((s) => {
      const rows: Cell[][] = [];
      const hiddenRows: number[] = [];
      const merges: [number, number, number, number][] = [];
      const set = (r: number, c: number, v: Cell) => {
        (rows[r] ??= [])[c] = v;
      };
      let pendingString: [number, number] | null = null;
      const start = byOffset.get(s.offset);
      if (start === undefined) return { name: s.name, hidden: s.hidden, rows: [], hiddenRows: [] };
      for (let k = start + 1; k < recs.length; k++) {
        const r = recs[k]!;
        if (r.type === R.EOF) break;
        if (r.type === R.BOF) {
          // An embedded chart's substream: skip to its EOF.
          while (k < recs.length && recs[k]!.type !== R.EOF) k++;
          continue;
        }
        const d = r.parts[0]!;
        if (d.length < 4 && r.type !== R.STRING) continue;
        const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
        const row = dv.getUint16(0, true);
        const col = d.length >= 4 ? dv.getUint16(2, true) : 0;
        switch (r.type) {
          case R.LABELSST:
            set(row, col, sst[dv.getUint32(6, true)] ?? '');
            break;
          case R.LABEL:
            set(row, col, new PartReader([d.subarray(6), ...r.parts.slice(1)]).string());
            break;
          case R.NUMBER:
            set(row, col, dv.getFloat64(6, true));
            break;
          case R.RK:
            set(row, col, rk(dv.getUint32(6, true)));
            break;
          case R.MULRK:
            for (let c = col, p = 4; p + 6 <= d.length - 2; c++, p += 6) set(row, c, rk(dv.getUint32(p + 2, true)));
            break;
          case R.BOOLERR:
            set(row, col, d[7] ? ERRORS[d[6]!] ?? '#ERROR' : String(d[6] === 1));
            break;
          case R.FORMULA: {
            if (dv.getUint16(12, true) !== 0xffff) {
              set(row, col, dv.getFloat64(6, true));
              break;
            }
            const kind = d[6]!;
            if (kind === 0) pendingString = [row, col];
            else if (kind === 1) set(row, col, String(d[8] === 1));
            else if (kind === 2) set(row, col, ERRORS[d[8]!] ?? '#ERROR');
            else set(row, col, '');
            break;
          }
          case R.STRING:
            if (pendingString) set(pendingString[0], pendingString[1], new PartReader(r.parts).string());
            pendingString = null;
            break;
          case R.ROW:
            if (d.length >= 14 && dv.getUint16(12, true) & 0x20) hiddenRows.push(row + 1);
            break;
          case R.MERGEDCELLS: {
            const n = dv.getUint16(0, true);
            for (let m = 0; m < n && 2 + m * 8 + 8 <= d.length; m++) {
              const o = 2 + m * 8;
              merges.push([dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true), dv.getUint16(o + 6, true)]);
            }
            break;
          }
        }
      }
      for (const [r1, r2, c1, c2] of merges)
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if ((r !== r1 || c !== c1) && rows[r]?.[c] !== undefined) rows[r]![c] = null;
      return { name: s.name, hidden: s.hidden, rows: Array.from(rows, (r) => Array.from(r ?? [], (c) => c ?? null)), hiddenRows };
    });
}
