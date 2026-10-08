# OAuth — testes locais e homologação real

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

## Evidência documental revalidada

[Autenticação oficial](https://api-docs.erp.olist.com/documentacao/comecando/autenticacao), consultada em 08/10/2026: authorization code; autorização em `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth`; token/refresh em `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token`; form URL encoded com Client ID/Secret no servidor, `redirect_uri` exata e código. Recursos usam Bearer. Documento informa access token 4 horas e refresh token 1 dia; implementação prefere expires_in observado e respeita refresh_expires_in quando disponível.

State aleatório de 32 bytes ligado a cookie de sessão, único e expira em cinco minutos; comparação por hashes de tamanho fixo. Validar URI, um state, cookie, um code e erro. Consumir state antes de aguardar a troca impede replays paralelos; erro do provedor também consome a tentativa válida. Rejeição não ecoa error_description, código ou estado. Resposta de token validada: access_token não vazio/sem controles, Bearer, expires_in positivo, refresh opcional textual e prazo válido. Nenhum JWT é decodificado como prova de empresa; /info verifica conta esperada.

Refresh somente quando autorizado por variável explícita e necessário por prazo (margem 30 segundos); chamadas concorrentes compartilham uma renovação. Rotação atualiza memória; sem token novo a implementação não estende a validade anterior do refresh. Falha/expiração exige reconectar. 401 em GET desconecta sem repetição automática e sem renovação em loop. Métricas OAuth distinguem resposta recebida de token validado: HTTP 200 não basta para afirmar conexão.

## PKCE — investigação inicial (histórico)

A página OAuth não declara PKCE. Tentativa pública de descoberta OIDC na URL padrão derivada do realm documentado (`https://accounts.tiny.com.br/realms/tiny/.well-known/openid-configuration`) terminou em timeout, sem obter metadata. Isso não prova ausência de suporte. **Suporte/exigência permanece NÃO CONFIRMADO.**

S256 já implementado/testado com verifier/challenge. Live config exige evidência administrativa/documental antes de escolher `TINY_POC_PKCE_SUPPORT=confirmed-s256`; `confirmed-unsupported` somente após confirmar que o provedor/aplicativo não suporta PKCE e não o exige. `pending` bloqueia conexão. Não fazer fallback automático de S256 para ausência de PKCE em resposta a erro. Não inventado endpoint de revogação; desconexão é apenas local. Não houve renovação ou revogação real.

## Sete pré-requisitos — estado na entrega inicial (histórico)

| Confirmação necessária | Estado real |
|---|---|
| Conta/empresa Tiny autorizada e identificação esperada para /info | PENDENTE |
| Plano contratado, API V3 e extensão disponíveis | PENDENTE |
| Usuário autorizado a conectar aplicativo | PENDENTE |
| Leitura nos módulos e recursos concedidos; sem escrita | PENDENTE |
| Máquina/runtime seguro e credenciais configuradas nele | PENDENTE |
| Redirect URI exata cadastrada e aceita pelo ERP | PENDENTE |
| Autorização explícita para até oito GETs e detalhes opcionais | PENDENTE |

`TINY_POC_APPROVED=yes` representa registro dessas confirmações pelo operador, não autorização deduzida do início desta etapa nem de sucesso OAuth. Secret/chaves não devem ser enviados no chat. Variáveis do exemplo são server-only, não NEXT_PUBLIC. Atualizações de permissões/secret e reautorização seguem orientações oficiais; sequências e permissões da conta precisam de validação real.

## Resultado dos testes na entrega inicial (histórico)

Authorization code/PKCE/state/cookie/replay/expiry/refresh/denial/desconexão em voo passaram com fetch mock. Uma conexão HTTP local real foi usada somente para testar proteção do serviço com respostas sintéticas do provedor. **OAuth com Tiny: NÃO EXECUTADO.** A palavra “validado” neste arquivo se refere aos testes locais da implementação, não à conta Atram.

## Homologação operacional posterior à implementação inicial — 08/10/2026

Segundo o responsável, o aplicativo foi criado, credenciais foram configuradas em arquivo local protegido e o callback `http://127.0.0.1:8787/oauth/callback` foi aceito na conexão real. O provedor OIDC anunciou `plain` e `S256`; S256 foi configurado e utilizado na sessão bem-sucedida. Esse relato posterior resolve a pendência inicial de suporte anunciado e funcionamento da configuração S256 nesta sessão; a IA não obteve a metadata independentemente nesta consolidação. Não implica que plain tenha sido testado nem que S256 seja exigido em todos os aplicativos.

O usuário acessou /oauth/start, autenticou-se na página oficial Tiny, autorizou o aplicativo e recebeu /status conectado. Após corrigir a leitura de Informações da Conta e autorizar novamente, /info retornou 200 OK e a comparação do documento esperado no servidor foi aprovada. Estado final informado: connected=true, accountVerified=true, usedGETs=5, remainingGETs=3, busy=false. Evidência fornecida: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

Autorização de leitura e uso da API foram demonstrados para os cinco recursos nesta configuração. Nome exato do plano contratado, quota efetiva, associação de todas as permissões e autorização de detalhes opcionais não foram demonstrados pelo relatório. Não estender essa autorização a novas consultas automáticas. O incidente 403 mostra que OAuth conectado não basta para acesso a módulos.

**Não testados no provedor real:** refresh, expiração natural, revogação remota, recuperação após indisponibilidade, múltiplos usuários ou hospedagem pública. Os mocks não substituem esses testes. Segredos permaneceram locais conforme declaração do responsável; nenhuma credencial aparece na evidência recebida. Não houve inspeção forense do computador/arquivos ou de armazenamento local. Nenhum fluxo OAuth foi alterado nesta consolidação.
