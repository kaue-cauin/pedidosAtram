import type { OrderStatus } from '../../types/order.ts';
// These are eligible edges, not sufficient authorization. SQL also enforces proof, CAS and holds.
export const MATRIX: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT:['DRAFT','VALIDATING'], VALIDATING:['DRAFT','VALIDATING','READY'],
  READY:['READY','SUBMITTING','ERROR'],SUBMITTING:['SUBMITTING','SUBMITTED','ERROR','UNKNOWN'],
  SUBMITTED:['SUBMITTED'],ERROR:['DRAFT','SUBMITTING','SUBMITTED','ERROR','UNKNOWN'],UNKNOWN:['SUBMITTED','ERROR','UNKNOWN'],
};
export const permitsEdge=(from:OrderStatus,to:OrderStatus)=>MATRIX[from].includes(to);
