# Homologação futura, sem autorização implícita

Nenhuma chamada autenticada real Tiny, configuração de credencial real ou escrita no ERP foi executada na 7B.3. Os testes usam apenas fetchers sintéticos. Flags de OAuth, read, refresh, sync e detail permanecem desabilitados por padrão. Esta documentação não autoriza ligá-los.

| Fase | Pré-condições e limite |
| --- | --- |
| R1 — preparação | origem HTTPS autenticada, sessão/RBAC/proxy revisados, conta correta, escopos e política de retenção, operador e janela autorizados, backups restauráveis |
| R2 — páginas pequenas | autorização específica de GET, orçamento aprovado, poucos registros, confirmar limit/offset/total, lexemas, unidades, status e identidade; relatório só sanitizado |
| R3 — carga completa | autorização separada após R2, estimativa de GET/duração/quota compartilhada, limites e cancelamento, revisão de cobertura e anomalias, rollback ensaiado |
| R4 — comercial | aprovar elegibilidade, unidades/apresentações, escala/arredondamento/moeda, promoção/listas, pesos físicos, vendedor sem vínculo e permissões; não autoriza escrita |

No cenário **sintético** de 900 produtos, 100 contatos, 5 vendedores e 3 listas, limite 25 exige 42 páginas básicas. Orçamento de 4 segundos implica aproximadamente 168 segundos de intervalos, mais latência e eventual `/info`. Até dez detalhes adicionam consumo. Contagens/quota reais não são conhecidas por extrapolação da amostra 7B.1. Planejar outros aplicativos na mesma conta e reservar capacidade futura; não multiplicar quota por usuários.

Incremental permanece preparado pelo schema e desabilitado até confirmação de timezone, precisão, inclusão da borda, exclusões e consistência. Usar full controlado por enquanto. Offset não garante fotografia atômica; totais/duplicados/diferenças reduzem riscos, sem provar ausência de omissões.

## Antes da implantação comercial

- Configuração segura do rate limit de login atrás de proxy, lista de proxies confiáveis e derivação de IP. Atualmente usa socket; não confiar em X-Forwarded-For arbitrário.
- Política de senhas e administração das contas, reset e revogação. Hash existente não substitui política operacional aprovada.
- Homologação do OAuth persistente, rotação de refresh e desconexão na conta real, mediante autorização própria.
- Plano de backup/restauração PostgreSQL e das chaves de criptografia: backup cifrado fora do servidor, acesso restrito, versões/keyring preservados, retenção e restauração ensaiada. Restaurar banco sem a chave correta inviabiliza tokens; rotação não elimina necessidade de versões antigas.
- Origem operacional autenticada e política de projeções/retensão/cache privado. GitHub Pages continua demonstração mock, sem administração ou dados reais.
- Política financeira/comercial dos preços, promoção, listas, unidades, pesos, contatos e vendedores. REAL permanece PENDING/BLOCKED.
- Executar e revisar a matriz de navegador da 7B.3, incluindo fechamento/reabertura, offline real, teclado e tempos React/DOM. A evidência Node não é equivalente.

A 7B.4, ledger distribuído e idempotência real de criação não foram iniciados. Nenhuma revisão desta infraestrutura autoriza criar pedidos reais.
