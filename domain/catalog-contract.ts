// Shared pure integrity contract. Never imports database, tokens or backend code.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string,unknown>;
  return '{' + Object.keys(object).sort().map(key => JSON.stringify(key)+':'+canonical(object[key])).join(',') + '}';
}
export interface CatalogResourceManifest { count:number; checksum:string; complete:boolean }
export interface CatalogManifest { version:string; organizationId:string; mode:'FIXTURE'|'REAL'; state:string; commercial:'PENDING'|'SYNTHETIC_ONLY'; createdAt:string; publishedAt:string|null; resources:Record<string,CatalogResourceManifest>; checksum:string; cache:{ maxAgeSeconds:number; offlineAllowed:boolean }; compatibility:'TECHNICAL_ONLY' }
