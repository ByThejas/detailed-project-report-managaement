import { useState } from 'react';
import { Plus } from 'lucide-react';

const SOURCES = ['Operations', 'P&C', 'R&D', 'SCADA', 'Civil', 'Other'];

/** Adds an optional document to this DPR only, with its name and the department that provides it. */
export function AddDocumentForm({ onAdd, existing }: { onAdd: (name: string, source: string) => void; existing: string[] }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('Operations');
  const clash = existing.some((n) => n.toLowerCase() === name.trim().toLowerCase());
  const add = () => {
    if (!name.trim() || clash) return;
    onAdd(name.trim(), source);
    setName('');
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-[13px]"
      onSubmit={(ev) => {
        ev.preventDefault();
        add();
      }}
    >
      <input aria-label="New document name" className="input h-8 min-w-[14rem] flex-1" placeholder="Document name, e.g. Forest NOC" value={name} onChange={(ev) => setName(ev.target.value)} />
      <select aria-label="Provided by" className="input h-8 w-auto" value={source} onChange={(ev) => setSource(ev.target.value)}>
        {SOURCES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button type="submit" className="btn-secondary h-8" disabled={!name.trim() || clash}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add document
      </button>
      {clash && <span className="text-xs text-amber-700">A document with this name is already listed.</span>}
    </form>
  );
}
