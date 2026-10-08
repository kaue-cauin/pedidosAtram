import { Stage6Lab } from '@/components/order/stage6-lab';
import { LayoutLab } from '@/components/order/layout-lab';
export default function Stage6Diagnostics(){return <main className="performance-lab"><header><h1>Diagnóstico da Etapa 6</h1><a href={`${process.env.NEXT_PUBLIC_BASE_PATH??''}/`}>← Voltar ao pedido</a></header><Stage6Lab /><LayoutLab /><a href={`${process.env.NEXT_PUBLIC_BASE_PATH??''}/diagnostico/`}>Abrir diagnóstico de desempenho e autosave ↗</a></main>;}
