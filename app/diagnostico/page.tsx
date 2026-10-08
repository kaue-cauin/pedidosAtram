import { OfflineTest } from '@/components/order/offline-test';
import { PersistenceLab } from '@/components/order/persistence-lab';
export default function DiagnosticsPage() { return <><main className="performance-lab"><header><h1>Diagnóstico da Etapa 4</h1><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}>← Voltar ao pedido</a></header><OfflineTest /><PersistenceLab /></main><p className="previous-diagnostic"><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/diagnostico-etapa3/`}>Abrir comparação original da Etapa 3 ↗</a></p></>; }
