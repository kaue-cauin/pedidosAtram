export const resources = ['products','contacts','sellers','priceLists'] as const;
export type Resource = typeof resources[number];
export type CatalogMode = 'FIXTURE' | 'REAL';
export type Projection = Record<string, unknown> & { erpId: string; commercial: 'PENDING' | 'BLOCKED' | 'SYNTHETIC_ONLY' };
export interface DetailRequest { resource: 'products'|'priceLists'; id:string }
export interface Checkpoint { enrichment?: { queue:DetailRequest[]; index:number }; resourceIndex: number; offset: number; totals: Partial<Record<Resource,number>>; completed: Resource[]; previousPageHash?: string }
export interface Job { id:string; organization_id:string; requested_by:string; snapshot_id:string; mode:CatalogMode; status:string; checkpoint:Checkpoint; pages_processed:number; records_received:number; records_validated:number; records_quarantined:number; attempt_count:number; execution_id:string|null; lease_until:Date|null; retry_after:Date|null; connection_version:number|null; account_key:string|null; baseline_snapshot_id:string|null }
