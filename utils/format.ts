const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kilograms = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
export const money = (cents: number) => currency.format(cents / 100);
export const decimalMoney = (cents: number) => decimal.format(cents / 100);
export const weight = (grams: number) => `${kilograms.format(grams / 1000)} kg`;
