import type { Resource } from './config.ts';
import { POCError } from './config.ts';
type Rule = { path: string; type: 'string' | 'integer' | 'number' | 'object' | 'array'; nullable?: boolean; values?: readonly string[] };
const rule = (path: string, type: Rule['type'], nullable = false, values?: readonly string[]): Rule => ({ path, type, nullable, values });
const productRules: Rule[] = [rule('id', 'integer'), rule('sku', 'string'), rule('gtin', 'string'), rule('descricao', 'string'),
  rule('unidade', 'string'), rule('situacao', 'string', false, ['A', 'I', 'E']), rule('tipo', 'string', false, ['K', 'S', 'V', 'F', 'M']),
  rule('precos', 'object'), rule('precos.preco', 'number', true), rule('precos.precoPromocional', 'number', true)];
const rules: Record<Resource, Rule[]> = {
  info: [rule('razaoSocial', 'string'), rule('cpfCnpj', 'string'), rule('fantasia', 'string')],
  products: productRules,
  contacts: [rule('id', 'integer'), rule('nome', 'string', true), rule('codigo', 'string', true),
    rule('situacao', 'string', true, ['B', 'A', 'I', 'E']), rule('tipos', 'array', true), rule('vendedor', 'object', true),
    rule('vendedor.id', 'integer'), rule('endereco', 'object'), rule('endereco.municipio', 'string', true), rule('endereco.uf', 'string', true)],
  sellers: [rule('id', 'integer'), rule('contato', 'object'), rule('contato.id', 'integer'), rule('contato.nome', 'string', true),
    rule('situacao', 'string', true, ['B', 'A', 'I', 'E'])],
  priceLists: [rule('id', 'integer'), rule('descricao', 'string', true), rule('acrescimoDesconto', 'number', true)],
  productDetail: [rule('id', 'integer', true), rule('sku', 'string', true), rule('gtin', 'string', true), rule('descricao', 'string', true),
    rule('unidade', 'string', true), rule('situacao', 'string', true, ['A', 'I', 'E']), rule('tipo', 'string', true, ['P', 'S', 'K', 'V', 'F', 'M']),
    rule('marca', 'object'), rule('marca.id', 'integer', true), rule('marca.nome', 'string', true), rule('dimensoes', 'object'),
    rule('dimensoes.pesoBruto', 'number', true), rule('dimensoes.pesoLiquido', 'number', true), rule('variacoes', 'array'),
    rule('precos', 'object'), rule('precos.preco', 'number', true), rule('unidadePorCaixa', 'string', true)],
  priceListDetail: [rule('id', 'integer'), rule('descricao', 'string', true), rule('acrescimoDesconto', 'number', true), rule('excecoes', 'object'),
    rule('excecoes.idProduto', 'integer', true), rule('excecoes.codigo', 'string', true), rule('excecoes.preco', 'number', true), rule('excecoes.precoPromocional', 'number', true)],
};
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export interface Observation {
  compatible: boolean; itemCount: number; missingIdentity: number;
  fields: { field: string; present: number; missing: number; nulls: number; incompatible: number }[];
  unitCounts?: { UN: number; other: number; missing: number };
  conflicts: string[];
}
function get(value: Record<string, unknown>, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split('.')) { if (!object(current)) return undefined; current = current[key]; }
  return current;
}
// Return field names/counts only. Never stringify unknown DTO keys, values, documents or units.
export function observe(resource: Resource, data: unknown): Observation {
  if (!object(data)) throw new POCError('INCOMPATIBLE_JSON');
  let items: Record<string, unknown>[];
  if (['products', 'contacts', 'sellers', 'priceLists'].includes(resource)) {
    if (!Array.isArray(data.itens) || data.itens.length > 10 || !data.itens.every(object) || !object(data.paginacao) ||
        !['limit', 'offset', 'total'].every(k => Number.isSafeInteger(data.paginacao && (data.paginacao as Record<string, unknown>)[k]) && Number((data.paginacao as Record<string, unknown>)[k]) >= 0) ||
        data.paginacao.offset !== 0) throw new POCError('INCOMPATIBLE_JSON');
    items = data.itens;
  } else items = [data];
  const fields = rules[resource].map(r => {
    const counts = { field: r.path, present: 0, missing: 0, nulls: 0, incompatible: 0 };
    for (const item of items) {
      const value = get(item, r.path);
      if (value === undefined) { counts.missing++; continue; }
      counts.present++;
      if (value === null) { counts.nulls++; if (!r.nullable) counts.incompatible++; continue; }
      const valid = r.type === 'integer' ? Number.isSafeInteger(value) : r.type === 'number' ? typeof value === 'number' && Number.isFinite(value) :
        r.type === 'array' ? Array.isArray(value) : r.type === 'object' ? object(value) : typeof value === 'string';
      if (!valid || (r.values && !r.values.includes(value as string))) counts.incompatible++;
    }
    return counts;
  });
  const missingIdentity = resource === 'info' ? 0 : items.filter(item => !Number.isSafeInteger(item.id) || Number(item.id) <= 0).length;
  const unitCounts = resource === 'products' || resource === 'productDetail' ? { UN: 0, other: 0, missing: 0 } : undefined;
  if (unitCounts) for (const item of items) { if (item.unidade === 'UN') unitCounts.UN++; else if (typeof item.unidade === 'string' && item.unidade) unitCounts.other++; else unitCounts.missing++; }
  const conflicts: string[] = [];
  if (resource === 'productDetail') conflicts.push('PRODUCT_TYPE_ALLOF_AMBIGUOUS');
  if (resource === 'priceListDetail' && Array.isArray(data.excecoes)) conflicts.push('PRICE_EXCEPTIONS_CARDINALITY');
  return { compatible: missingIdentity === 0 && fields.every(f => f.incompatible === 0), itemCount: items.length, missingIdentity, fields, unitCounts, conflicts };
}
