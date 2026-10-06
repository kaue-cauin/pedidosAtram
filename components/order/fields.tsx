'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Section({ title, icon, children, className = '', extra }: { title: string; icon?: ReactNode; children: ReactNode; className?: string; extra?: ReactNode }) {
  return <section className={`section-card ${className}`}><div className="section-heading"><h2>{icon}{title}</h2>{extra}</div>{children}</section>;
}

export function TextField({ label, suffix, className = '', ...props }: ComponentProps<'input'> & { label: string; suffix?: string }) {
  const id = useId();
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><div className="field-control"><Input id={id} className="form-input" {...props} />{suffix && <span className="field-suffix">{suffix}</span>}</div></div>;
}

export function ChoiceField({ label, options, defaultValue, value, onValueChange, className = '', placeholder, disabled = false }: { label: string; options: readonly (string | { value: string; label: string })[]; defaultValue?: string; value?: string; onValueChange?: (value: string) => void; className?: string; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><Select defaultValue={defaultValue} value={value} onValueChange={onValueChange} disabled={disabled}><SelectTrigger id={id} className="form-select"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" className="field-options" sideOffset={3}>{options.map(option => {
    const item = typeof option === 'string' ? { value: option, label: option } : option;
    return <SelectItem value={item.value} key={item.value}>{item.label}</SelectItem>;
  })}</SelectContent></Select></div>;
}

export function MoneyField({ label, defaultValue = '0,00', readOnly = false }: { label: string; defaultValue?: string; readOnly?: boolean }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><div className="money-field"><span>R$</span><Input id={id} className="form-input" defaultValue={defaultValue} inputMode="decimal" readOnly={readOnly} /></div></div>;
}

export function Unavailable({ children, message, className = '' }: { children: ReactNode; message: string; className?: string }) {
  return <Tooltip><TooltipTrigger asChild><span className={`unavailable-trigger ${className}`} tabIndex={0} aria-label={message}>{children}</span></TooltipTrigger><TooltipContent side="bottom" className="unavailable-tooltip">{message}</TooltipContent></Tooltip>;
}
