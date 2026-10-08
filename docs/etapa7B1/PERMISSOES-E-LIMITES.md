# Permissões e limites

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

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
| Módulos acessíveis e 401/403 | Dependem de token/usuário/permissões | Cinco GETs confirmados; 403 inicial em info resolvido; 401 não observado nesta evidência |

Não há quota genérica aplicada como limite real. Header ausente/malformado não recebe número inventado: fica ausente no relatório. Apenas números válidos são registrados; nunca texto arbitrário que possa conter dado pessoal. 429 ou remaining=0 pausam novas chamadas conforme Retry-After/Reset ou fallback conservador de 60 segundos, com teto de espera uma hora. Isso é política da POC, não comportamento confirmado do ERP. Não há retry automático ou tentativa deliberada de exceder quota; limite adicional absoluto de oito GETs permanece.

401 fecha a conexão e exige reautorização, sem presumir que seja apenas access token expirado (pode ser permissão). 403 registra PERMISSION_DENIED sem afirmar causa concreta. 400/404/5xx ficam como HTTP_ERROR sem corpo no diagnóstico. Erros de rede/timeout/JSON são códigos fixos sanitizados. É cliente de leitura; nenhum tratamento libera criação/reenvio de pedido. Risco crítico de idempotência da 7A continua válido para futuras fases de escrita.

Antes da POC real, administrador confirma plano/API/extensão, módulos, usuário e consumo por outros apps; só então registra a autorização e configura allowlist. Sucesso OAuth não autoriza módulo automaticamente. Não armazenar comprovantes contendo nomes/documentos ou credenciais no Git público.

## Permissões observadas e incidente 403 — 08/10/2026

Relato do responsável: OAuth já conectado, mas GET /info retornou 403 PERMISSION_DENIED porque leitura de **Informações da Conta** ainda não estava habilitada. Habilitou essa leitura, revisou a configuração local e autorizou OAuth novamente. /info passou a 200 OK, compatible=true e accountVerified=true. O acesso protegido depende de permissões além da autenticação; esse incidente não foi tratado como credencial inválida nem como falha a provocar novamente.

GETs de info, produtos, contatos, vendedores e listas-precos funcionaram na configuração atual. O administrador não encontrou módulo chamado Vendedores e habilitou leitura de Usuários antes do sucesso. Essa sequência **não isola causalidade**: “Acesso GET /vendedores confirmado na configuração atual da conta; associação exata da permissão ainda não isolada.” Não afirmar que Usuários é definitivamente a permissão responsável, nem desabilitar permissões para testar por tentativa nesta fase.

Orçamento informado da sessão final: cinco de oito GETs, três restantes. A tentativa 403 anterior é registrada separadamente; relação dos contadores/processos não informada. Esse orçamento é limite voluntário da POC, **não quota da conta Tiny**. Headers de quota não foram fornecidos: não inferir ausência de headers no servidor, valores, plano contratado, saldo por minuto, comportamento real 429 ou capacidade sob carga. Não provocar 429 deliberadamente. Detalhes opcionais e outros módulos não foram homologados.

A conexão de leitura está aprovada para o escopo fornecido; políticas para conexões futuras e associação mínima exata por endpoint ainda precisam de validação administrativa. Nenhuma consulta adicional realizada nesta consolidação.
