import { mkdir, writeFile } from 'node:fs/promises';
import { products, customers, sellers, priceLists, demoOrder } from '../domain/mock-data.ts';
await mkdir('outputs', { recursive: true });
await writeFile('outputs/mock-data.json', JSON.stringify({ products, customers, sellers, priceLists, demoOrder }, null, 2));
console.log('Dados fictícios exportados para outputs/mock-data.json');
