# Desempenho e limites da evidência

`PERFORMANCE-NODE.json` contém 36 cenários: 10/50/100/150/200/300 itens × rede simulada 0/50/100/300/1000 ms/offline. Catálogo sintético de 900 produtos, download de 18 páginas locais de 50 registros em background, índice ativo, autosave ligado, adaptadores reais do código com **fake-indexeddb**. Dez amostras após dois aquecimentos por cenário. Toda pesquisa é local; downloads não são iniciados por teclas. O último rascunho foi recuperado em todos os cenários.

Execução local em Node 24.19.0 (09/10/2026 UTC): máximo p95 do modelo + schedule **0,380 ms**; máximo p95 de busca **1,280 ms**. São medições de CPU/modelo/emulador. **Não são latência da UI, renderização React, pintura ou IndexedDB nativo.** Não comparar diretamente com os 18,9 ms de UI p95 pós-merge da 7B.2. O relatório inclui baseline do modelo sem autosave/background e os tempos separados de transferência, verificação, índice, persistência emulador e ativação.

O CI executa o mesmo benchmark e disponibiliza JSON próprio como artifact. PostgreSQL usa serviço real PostgreSQL 16 e registra separadamente tempo de coleta sintética; fetchers não representam latência Tiny real.

## Matriz de navegador pendente

O servidor de desenvolvimento local não ficou acessível pelo navegador deste ambiente. Não atribuímos resultados de Node ao navegador. A matriz visual permanece requerida antes de homologar a 7B.3.

1. Em uma máquina de referência Windows/notebook, `npm ci`, `npm run build` e servir **apenas** `out` em loopback com servidor estático. Alternativa: `npm run dev:next -- --hostname 127.0.0.1 --port 3000`. Desativar telemetria conforme política local. Registrar Chrome/Edge, versão, CPU, memória, viewport e escala.
2. Abrir `/diagnostico-etapa7b3/`. Preparar 900 produtos, limpar pesquisa/seleção e aplicar versão. Buscar por código, GTIN com zeros, palavras e marca; testar setas/Enter/Escape. Confirmar nenhuma requisição por tecla no DevTools.
3. Preparar outra versão durante digitação. Verificar que aplicar é recusado com pesquisa/seleção ativa; limpar e aplicar explicitamente. O pedido anterior não muda preço, descrição ou unidade.
4. Executar “Testar rede lenta e offline simulados”: 36 cenários, autosave ligado e transferências sintéticas de catálogo em background. Executar também comparação sem/com autosave e digitação contínua com armazenamento atrasado em 1 segundo.
5. Exportar JSON do catálogo e JSON UI/autosave. Anotar seleção por Enter, tabela, totais e oportunidade de pintura separadamente; o diagnóstico mede commit até useLayoutEffect, sem alegar pixels ou latência física do teclado. Comparar UI p95 com o método/ambiente da 7B.2, alvo visual <50 ms.
6. Aguardar service worker instalado; usar offline real do navegador, recarregar a rota, recuperar catálogo e rascunho. Fechar/reabrir navegador e repetir. Backend indisponível não deve afetar busca local/entrada mock.
7. Ensaiar logout e troca de organização na interface autenticada futura; hoje contratos/API e testes automatizados cobrem descarte e isolamento. REAL não usa cache offline nem a demonstração pública.

Esse roteiro não habilita flags reais, OAuth ou consultas Tiny. Não publicar o branch no Pages para contornar hospedagem segura.
