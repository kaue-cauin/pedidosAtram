# Permissões e limites

Data: **08/10/2026**. Implementação e testes locais com dados sintéticos. **Nenhuma autenticação ou consulta de dados reais executada. Homologação operacional PENDENTE.**

Fontes reconsultadas: [OAuth](https://api-docs.erp.olist.com/documentacao/comecando/autenticacao) e [limites](https://api-docs.erp.olist.com/documentacao/comecando/limites-de-consulta). Permissões mínimas são leitura em Dados/Informações da empresa, Produtos, Contatos, Vendedores e Listas de preços, conforme associação exata no painel/suporte. Detalhes exigem opt-in adicional. Nenhuma permissão de escrita necessária nesta POC.

| Dado | Documento | Observado na Atram |
|---|---|---|
| Limite por conta compartilhado entre aplicativos | Confirmado oficialmente | PENDENTE |
| Leitura/escrita com quotas separadas | Confirmado oficialmente | PENDENTE |
| X-RateLimit-Limit | Total por minuto | PENDENTE |
| X-RateLimit-Remaining | Saldo no minuto | PENDENTE |
| X-RateLimit-Reset | Segundos até reset, não epoch | PENDENTE |
| Retry-After | Não confirmado documentalmente neste contrato | PENDENTE; parser defensivo numérico/HTTP-date |
| Plano/quotas efetivas da Atram | Dependem da conta e apps concorrentes | PENDENTE |
| Módulos acessíveis e 401/403 | Dependem de token/usuário/permissões | PENDENTE |

Não há quota genérica aplicada como limite real. Header ausente/malformado não recebe número inventado: fica ausente no relatório. Apenas números válidos são registrados; nunca texto arbitrário que possa conter dado pessoal. 429 ou remaining=0 pausam novas chamadas conforme Retry-After/Reset ou fallback conservador de 60 segundos, com teto de espera uma hora. Isso é política da POC, não comportamento confirmado do ERP. Não há retry automático ou tentativa deliberada de exceder quota; limite adicional absoluto de oito GETs permanece.

401 fecha a conexão e exige reautorização, sem presumir que seja apenas access token expirado (pode ser permissão). 403 registra PERMISSION_DENIED sem afirmar causa concreta. 400/404/5xx ficam como HTTP_ERROR sem corpo no diagnóstico. Erros de rede/timeout/JSON são códigos fixos sanitizados. É cliente de leitura; nenhum tratamento libera criação/reenvio de pedido. Risco crítico de idempotência da 7A continua válido para futuras fases de escrita.

Antes da POC real, administrador confirma plano/API/extensão, módulos, usuário e consumo por outros apps; só então registra a autorização e configura allowlist. Sucesso OAuth não autoriza módulo automaticamente. Não armazenar comprovantes contendo nomes/documentos ou credenciais no Git público.
