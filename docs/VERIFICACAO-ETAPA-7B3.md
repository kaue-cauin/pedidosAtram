# Verificação da Etapa 7B.3

Data: 09/10/2026 UTC. Branch `etapa-7b3-catalogo`, base main `65db17b10c6a50bee931b10efdd736bcd74dfa75`. Implementação separada em A → B → C → D → E, cada fase validada em PostgreSQL real antes da seguinte. **Não houve merge, publicação no Pages, implantação do backend ou início da 7B.4.**

## Resultado e limite de aceite

Infraestrutura de catálogo técnico implementada e testada: staging, sete tabelas, jobs persistentes, coleta paginada, orçamento por conta, leases, recuperação controlada, mapeadores, referências/quarentenas, snapshots, CAS/rollback, API autenticada, cache/índice local e diagnóstico sintético.

**Homologação de navegador ainda pendente.** Não foi possível acessar a prévia local pelo navegador deste ambiente. A matriz Node foi executada, mas não substitui teclado/React/DOM, IndexedDB nativo nem fechar/reabrir e recarregar offline real. O PR deve permanecer em rascunho para revisão até essa validação e aceite do responsável. Não declarar a etapa integralmente homologada com métricas de outra natureza.

Catálogo REAL é sempre técnico PENDING/BLOCKED, somente ADMIN, sem persistência privada em IndexedDB/offline. Infraestrutura íntegra não implica preço/unidade/cliente aprovado para venda. A hospedagem da prévia real continua pendente; não conectamos o Pages ao banco comercial.

## Evidência sequencial

| Fase | Commit validado | Execução PostgreSQL |
| --- | --- | --- |
| A — banco/modelo | `6bfc667` | [37859330714](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37859330714) |
| B — leitor/jobs/quota | `08b61fb` | [37859947900](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37859947900) |
| C — mapeadores/comercial | `25b1e57` | [37860572161](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37860572161) |
| D — API/cache/diagnóstico | `01bf2a3` | [37863153766](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37863153766) |
| E — regressão/desempenho | `39940b7` | [37863793785](https://github.com/kaue-cauin/pedidosAtram/actions/runs/37863793785) |

Os primeiros ensaios de A detectaram ordem incorreta da chave única/FKs gerada e serialização dupla de JSON. Foram corrigidos e repetidos; execuções com falha não são evidência de aceite. Fixtures agora fecham clientes mesmo se migrations falharem.

## Testes

Suíte 7B.3: 17 casos com múltiplos cenários e PostgreSQL 16 real no CI; Node com IndexedDB emulado para contratos do cliente. Coletas 0/1/10/50/100/900/1000, última página curta, IDs dentro/entre páginas, total/offset/empty/identidade inválidos, falhas na primeira/intermediária/quase última página, HTTP 400/401/403/429/500, retries limitados, pausa persistente, cancelamento e resposta tardia, restart conservador, duas instâncias, organizações isoladas, referências e quarentenas, preços/unidades, detalhes explícitos, CAS/rollback, version pinning, checksum, transferência interrompida, scope/logout e rascunhos preservados.

| Verificação | Local | CI |
| --- | --- | --- |
| check:data, stage2, stage3, stage4, stage5, stage6 | PASS | PASS |
| check:stage7b1 | PASS — 19 casos | PASS |
| check:stage7b2 | Unidade PASS; PostgreSQL local indisponível | PASS — 16 casos, PostgreSQL real |
| check:stage7b3 | Contratos/mapeadores/cache/draft PASS; PostgreSQL no CI | PASS — 17 casos |
| check:stage7b3:performance | PASS — 36 cenários Node/emulador | PASS; artifact JSON separado |
| typecheck, lint | PASS; zero warnings de lint | PASS |
| build estático/offline | PASS — 40 recursos, 121 verificações VM | PASS com base /pedidosAtram |
| check:backend-boundary | PASS | PASS |
| Teclado/React/DOM/IndexedDB nativo/offline navegador | PENDENTE | Não medido por essas suítes |
| Tiny autenticado real | NÃO EXECUTADO | NÃO EXECUTADO |

A regressão preserva MockERPProvider, busca mock local, estados SUBMITTING/SUBMITTED/ERROR/UNKNOWN, bytes congelados, rascunhos e fila/debounce. Não há cálculo de preço real novo no domínio. `Product.unit` passou a textual, mantendo todos os mocks UN.

## Desempenho

[Relatório Node](etapa7B3/PERFORMANCE-NODE.json): 36 cenários 10..300, autosave ligado, catálogo 900 e atualização paginada em background. Dez amostras após dois aquecimentos. Máximo p95 modelo + schedule 0,380 ms; busca 1,280 ms; todas as recuperações PASS. CPU/indexação/transferência/IndexedDB emulado/ativação medidos separadamente. UI não medida. A referência [7B.2 pós-merge](etapa7B2/PUBLICACAO.md) de UI p95 até 18,9 ms é de outro método; não foi usada como comparação numérica direta.

Roteiro da matriz real: [PERFORMANCE-E-NAVEGADOR](etapa7B3/PERFORMANCE-E-NAVEGADOR.md). `/diagnostico-etapa7b3/` tem fixtures públicas, busca por teclado, troca controlada de versão e o laboratório de autosave com background. Nenhuma chamada Tiny nessa rota.

## Garantias e pendências

- Memória/busca não aguardam IndexedDB ou ERP. Download/indexação fora da digitação; ativação exige entrada quieta e ação explícita. Falha mantém versão íntegra, sem alterar itens capturados.
- Cada download fixa a versão; cache escopado por organização/usuário/projeção, integridade validada, validade limitada e descarte após logout. REAL não é cacheado.
- Jobs só começam por ADMIN e flags explícitos. Startup/migrations/build não acessam o Tiny. Orçamento compartilhado por identidade verificada; hipóteses conservadoras não são quota homologada.
- Snapshots completos são técnicos. Anomalias exigem revisão e reconhecimento; ativo anterior permanece disponível. Offset ainda pode omitir alterações com total estável, sem garantia atômica do provedor.
- OAuth/read/refresh/sync/detail e fixture permanecem `no` por padrão. OAuth real=0, GET autenticado real=0, refresh real=0, escrita real=0.
- Antes de implantação comercial: rate limit atrás de proxy, política de senhas, homologação OAuth persistente e backup/restauração PostgreSQL + keyring; preços/unidades/pesos/cliente/listas e projeções dependem de aprovação.

Detalhes: [Arquitetura/banco](etapa7B3/ARQUITETURA-E-BANCO.md), [sincronização](etapa7B3/SINCRONIZACAO.md), [mapeamento comercial](etapa7B3/MAPEAMENTO-COMERCIAL.md), [API/cache](etapa7B3/API-E-CACHE.md), [R1–R4 e pendências](etapa7B3/HOMOLOGACAO-REAL-E-PENDENCIAS.md).

Não comercialmente homologado. Parar na revisão deste PR; nenhuma autorização para merge, Pages, Tiny real ou 7B.4 é inferida deste relatório.

## Segunda revisão de ede17bd

Ver [SEGUNDA-REVISAO.md](etapa7B3/SEGUNDA-REVISAO.md) para a reprodução do head prematuro, separação prepared/active e geração de conexão versus revisão de credenciais, testes PostgreSQL com OAuth simulado e limitação concreta do navegador. O PR continua em rascunho, aguardando segunda revisão e homologação visual. Os resultados históricos acima não substituem as evidências desta correção.

Na segunda revisão, o CI de `ad3631a` aprovou 24 testes da 7B.3, 16 da 7B.2, 19 da 7B.1, regressões 2–6, 36 cenários Node, typecheck, lint, build e boundary. PostgreSQL 16.15 real e OAuth simulado. A matriz visual permanece pendente por ERR_CONNECTION_REFUSED no Chrome remoto. Evidência detalhada e números separados em REGRESSAO.json e SEGUNDA-REVISAO.md.

## Complementação de navegador — 09/10/2026

Homologação PARCIAL no preview Netlify: 36 cenários e 48 lotes com IndexedDB nativo, autosave, catálogo em background, teclado, ativação explícita A/B, recuperação, logout e Mock ERP passaram. UI p95 máximo 24,8 ms. Permanecem offline real, reinício completo do navegador e captura de tráfego por tecla, além da identificação do SHA de build. [Relatório e evidências](etapa7B3/HOMOLOGACAO-NAVEGADOR.md). PR #2 continua em rascunho; main/Pages/backend/Tiny real preservados.
