import type { Customer, Order, OrderItem, PriceList, Product, Seller } from '../types/order';

// Deterministic fixtures. Prices, customers, names and identifiers are fictional.
const templates = [
  ['Granola Tradicional', 1000, 'g', 1890],
  ['Granola Zero Açúcar', 1000, 'g', 2290],
  ['Granola Castanhas', 500, 'g', 1990],
  ['Whey Protein Chocolate', 900, 'g', 7250],
  ['Açúcar de Coco', 500, 'g', 1420],
  ['Azeite Extra Virgem', 500, 'ml', 3990],
  ['Biscoito de Arroz Integral', 150, 'g', 780],
  ['Geleia de Frutas Vermelhas', 280, 'g', 1690],
  ['Farinha de Aveia', 1000, 'g', 1250],
  ['Pipoca Orgânica', 500, 'g', 990],
  ['Mel Silvestre', 500, 'g', 2800],
  ['Chocolate 70% Cacau', 100, 'g', 650],
  ['Pasta de Amendoim Integral', 500, 'g', 2190],
  ['Mix de Castanhas', 200, 'g', 1690],
  ['Chia em Grãos', 250, 'g', 1390],
  ['Linhaça Dourada', 250, 'g', 1090],
  ['Quinoa em Grãos', 500, 'g', 2490],
  ['Farinha de Amêndoas', 200, 'g', 2690],
  ['Cacau em Pó 100%', 200, 'g', 1790],
  ['Óleo de Coco', 200, 'ml', 2390],
  ['Vinagre de Maçã', 500, 'ml', 1490],
  ['Arroz Integral', 1000, 'g', 1190],
  ['Banana Desidratada', 100, 'g', 890],
  ['Uva Passa', 200, 'g', 790],
  ['Biscoito de Polvilho', 100, 'g', 590],
  ['Aveia em Flocos', 500, 'g', 990],
  ['Suco de Uva Integral', 1000, 'ml', 1890],
  ['Farofa de Mandioca', 250, 'g', 890],
  ['Ghee Tradicional', 200, 'g', 2990],
  ['Macarrão de Arroz', 500, 'g', 1590],
] as const;

const brands = ['Raiz da Serra', 'Grão do Vale', 'Vila Nutre', 'Semente Clara', 'Bom Pomar', 'Campo Sereno', 'Nativa do Sol', 'Essência do Grão', 'Folha & Fruto', 'Casa da Colheita'];
const sizeFactors = [1, 0.5, 2] as const;

function mockEan(index: number): string {
  // Internal-use 200 prefix, not a real registered product GTIN.
  const base = `200${String(index + 1).padStart(9, '0')}`;
  const sum = [...base].reduce((total, digit, position) => total + Number(digit) * (position % 2 === 0 ? 1 : 3), 0);
  return base + ((10 - sum % 10) % 10);
}

export function generateProducts(): Product[] {
  return Array.from({ length: 900 }, (_, index) => {
    const [name, size, measure, price] = templates[index % templates.length];
    const brandIndex = Math.floor(index / templates.length) % brands.length;
    const factor = sizeFactors[Math.floor(index / (templates.length * brands.length))];
    const amount = size * factor;
    const pack = measure === 'g' && amount >= 1000 ? `${amount / 1000}kg` : `${amount}${measure}`;
    const netWeightGrams = Math.round(amount * (measure === 'ml' ? 0.95 : 1));
    return {
      id: `product-${String(index + 1).padStart(4, '0')}`,
      code: String(100001 + index),
      ean: mockEan(index),
      name: `${name} ${pack}`,
      brand: brands[brandIndex],
      unit: 'UN',
      priceCents: Math.round(price * factor * (1 + brandIndex * 0.025)),
      grossWeightGrams: netWeightGrams + (measure === 'ml' ? 180 : 35),
      netWeightGrams,
      status: 'ACTIVE',
    };
  });
}

export function generateCustomers(): Customer[] {
  const cities = ['São Caetano do Sul', 'Santo André', 'São Paulo', 'São Bernardo do Campo', 'Diadema', 'Mauá', 'Guarulhos', 'Osasco'];
  const firstNames = ['Mercado Exemplo Ltda', 'Mercado Exemplo 2', 'Mercadinho Exemplo', 'Supermercado Exemplo'];
  const kinds = ['Empório', 'Mercado', 'Casa Natural', 'Armazém', 'Quitanda'];
  return Array.from({ length: 100 }, (_, index) => ({
    id: `customer-${String(index + 1).padStart(3, '0')}`,
    code: `C${String(index + 1).padStart(3, '0')}`,
    name: firstNames[index] ?? `${kinds[index % kinds.length]} Exemplo ${String(index + 1).padStart(3, '0')}`,
    taxId: '00.000.000/0001-00',
    city: cities[index % cities.length],
    state: 'SP',
  }));
}

export const products = generateProducts();
export const customers = generateCustomers();
export const sellers: Seller[] = [
  { id: 'seller-1', name: 'Ana Costa' },
  { id: 'seller-2', name: 'Bruno Lima' },
  { id: 'seller-3', name: 'Carla Nunes' },
  { id: 'seller-4', name: 'Daniel Alves' },
  { id: 'seller-5', name: 'Elisa Rocha' },
];
export const priceLists: PriceList[] = [
  { id: 'standard', name: 'Padrão' },
  { id: 'wholesale', name: 'Atacado' },
  { id: 'special', name: 'Condições especiais' },
];
export const paymentMethods = ['Boleto', 'Pix', 'Transferência', 'Cartão de crédito'];
export const shippingMethods = ['Entrega própria', 'Transportadora', 'Retirada no depósito'];

const demoIndexes = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const demoQuantities = [10, 4, 12, 3, 8, 6, 5, 10, 2, 15];
export const demoItems: OrderItem[] = demoIndexes.map((productIndex, index) => {
  const p = products[productIndex];
  return { id: `item-${index + 1}`, productId: p.id, code: p.code, name: p.name, brand: p.brand, unit: p.unit, quantity: demoQuantities[index], unitPriceCents: p.priceCents, discountBasisPoints: 0, grossWeightGrams: p.grossWeightGrams, netWeightGrams: p.netWeightGrams };
});

// Stable UUID reserved for this visual fixture, not a real saved order.
export const demoOrder: Order = {
  orderId: 'c7c884e8-8733-4f6e-b22c-8b69f08a66a1', submissionId: null, status: 'DRAFT',
  customerId: customers[0].id, sellerId: sellers[0].id, operation: 'Venda de mercadorias', number: '', priceListId: 'standard',
  saleDate: '2026-10-02', deliveryDate: '', shippingDate: '', warehouse: 'Principal', intermediary: 'Sem intermediador',
  customerFreightCents: 0, companyFreightCents: 0, expensesCents: 0, generalDiscountBasisPoints: 0, items: demoItems,
  payment: { method: 'Boleto', channel: 'Banco', bank: 'Itaú', category: 'Vendas', terms: '30 60 90' },
  shipping: { method: 'Entrega própria', freightType: 'Normal', trackingCode: '', trackingUrl: '', payer: 'Remetente', carrier: '', volumes: 1, sendToDispatch: false },
  notes: '', internalNotes: '',
};
