'use client';
import { useState } from 'react';
import { OrderWorkspace } from './order-workspace';
export function LayoutPreview(){const [items,setItems]=useState(10);return <><label className="preview-size">Itens da prévia <select aria-label="Itens da prévia" value={items} onChange={e=>setItems(Number(e.target.value))}>{[10,100,200,300].map(n=><option key={n}>{n}</option>)}</select></label><OrderWorkspace key={items} previewItems={items} /></>;}
