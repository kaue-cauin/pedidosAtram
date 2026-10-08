import { PerformanceLab } from '@/components/order/performance-lab';
import { OfflineTest } from '@/components/order/offline-test';
import { PersistenceLab } from '@/components/order/persistence-lab';
export default function DiagnosticsPage() { return <><main className="performance-lab"><header><h1>Diagnóstico da Etapa 4</h1><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}>← Voltar ao pedido</a></header><OfflineTest /><PersistenceLab /></main><details className="previous-diagnostic"><summary>Comparação original da Etapa 3</summary><PerformanceLab /></details></>; }
