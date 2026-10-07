'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';

type Props<T extends { id: string }> = {
  id: string; label: string; placeholder: string; value: string;
  search: (query: string) => T[]; render: (item: T) => ReactNode;
  onChange: (value: string) => void; onSelect: (item: T) => void;
};
export function LocalAutocomplete<T extends { id: string }>({ id, label, placeholder, value, search, render, onChange, onSelect }: Props<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = open ? search(value) : [];
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  function select(item: T) { onSelect(item); setOpen(false); setActive(0); }
  return <div className="field autocomplete-field"><label htmlFor={id}>{label}</label><Input id={id} className="form-input" placeholder={placeholder} value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open && !!value.trim()} aria-controls={listId} aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
    onFocus={event => event.currentTarget.select()}
    onChange={event => { onChange(event.target.value); setOpen(true); setActive(0); }}
    onBlur={() => setOpen(false)}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => open ? Math.max(0, Math.min(results.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))) : 0); }
      if (event.key === 'Enter') { event.preventDefault(); if (open && results[active]) select(results[active]); else setOpen(true); }
    }} />
    {open && !!value.trim() && <div className="autocomplete-popup" id={listId} role="listbox" aria-label={`Sugestões de ${label}`} ref={list}>
      {results.length ? results.map((item, i) => <div id={`${listId}-${item.id}`} key={item.id} role="option" aria-selected={active === i} className="autocomplete-option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => select(item)}>{render(item)}</div>) : <div className="autocomplete-empty">Nenhum resultado encontrado.</div>}
      <div className="autocomplete-hint">↑ ↓ navegar · Enter selecionar · Esc fechar · até 12 resultados</div>
    </div>}
  </div>;
}
