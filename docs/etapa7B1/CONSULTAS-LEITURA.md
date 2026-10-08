# Consultas de leitura da POC

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

## Allowlist e sequência

Base fixa `https://api.tiny.com.br/public-api/v3`, verbos de dados **GET apenas**. Usuário não fornece URL, path, método, offset ou headers do ERP. Timeout padrão dez segundos incluindo corpo, limite 1 MiB, redirects bloqueados, sem retries automáticos e uma requisição de recurso por vez. JSON de token limitado a 64 KiB. Chamadas despachadas contam no orçamento mesmo em erro/timeout; falha anterior ao despacho não conta. Desconectar/reautorizar não zera orçamento de oito GETs do processo, nem pausa de rate limit.

| Enum local | GET autorizado | Restrição | Real |
|---|---|---|---|
| info | /info | Deve vir primeiro; documento da conta comparado somente no servidor | 200 / OK, sessão relatada |
| products | /produtos?limit=10&offset=0 | Só primeira página, sem filtros de PII | 200 / OK, sessão relatada |
| contacts | /contatos?limit=10&offset=0 | Só primeira página, sem DTO no frontend | 200 / OK, sessão relatada |
| sellers | /vendedores?limit=10&offset=0 | Só primeira página | 200 / OK, sessão relatada |
| priceLists | /listas-precos?limit=10&offset=0 | Só primeira página | 200 / OK, sessão relatada |
| productDetail | /produtos/{idProduto} | Opt-in, ID único configurado e finalidade marca/peso/estrutura | PENDENTE |
| priceListDetail | /listas-precos/{idListaDePreco} | Opt-in e ID único configurado | PENDENTE |

A sequência básica consome cinco GETs. Até dois detalhes autorizados cabem no orçamento; a oitava chamada é reserva para investigação específica, não instrução para retry cego. Recurso fora da allowlist configurada é bloqueado antes da rede. Pedidos existentes não estão disponíveis no cliente e exigiriam autorização adicional e implementação específica em fase futura. O serviço não oferece criar/alterar recursos ERP. Um novo processo para novo orçamento exige nova autorização/registro operacional, não deve ser usado para contornar o limite.

## Rotas locais protegidas

| Rota | Método | Ação |
|---|---|---|
| /oauth/start | GET autenticado local | Preparar state/cookie e redirecionar ao provedor |
| /oauth/callback | GET com cookie/state válidos | Trocar código no servidor e limpar endereço por redirect |
| /status | GET autenticado local | Flags da conexão, verificação de conta, busy e saldo do orçamento |
| /read?resource=ENUM | POST autenticado local | Executar um GET externo autorizado e retornar observação sanitizada |
| /report | GET autenticado local | Métricas sanitizadas de OAuth e leituras |
| /disconnect | POST autenticado local | Invalidar sessão local, sem revogação remota |

Nenhuma rota local é adicionada à aplicação Next/Pages. Host exato e origem/fetch-site bloqueiam ações de sites externos; callback admite redirect do ERP exclusivamente com vínculo de sessão. Uma credencial própria protege controles locais, sem ser credencial do ERP. Não abrir acesso remoto por túnel público sem revisão separada.

## Testes mock e estado na entrega inicial (histórico)

GETs reais: **zero**. Recursos realmente acessíveis/não acessíveis: **não determinados**, nenhum 401/403/429 real observado. Não marcar recursos como inacessíveis pela ausência de credenciais. Mocks confirmam sucesso, conta divergente, 401, 403, 429, 500, JSON inválido, parsing/tipos, timeout no header/corpo, quotas, budget e concorrência. Nenhum erro foi provocado na conta real.

Observações retornam campos conhecidos, contagens de presença/null/tipo, compatibilidade parcial e conflitos. Não incluem nome, documento, endereço, SKU/EAN, IDs reais, marcas, valores de preço nem valores desconhecidos de unidade. Informações completas ficam temporariamente no processo somente durante parsing/checagem, não são armazenadas. O orçamento/contagens não equivalem a sincronização completa.

## Consultas reais observadas — 08/10/2026

Resultados fornecidos pelo responsável durante sua sessão local autorizada; não consultados independentemente pela IA. Todas as cinco observações: compatible=true, missingIdentity=0 e conflicts=[] nas regras selecionadas da POC.

| Recurso | Endpoint GET | HTTP | Resultado | Duração individual (ms) | Registros da amostra |
|---|---|---:|---|---:|---:|
| info | /info | 200 | OK | 362,64 | 1 |
| products | /produtos | 200 | OK | 518,98 | 10 |
| contacts | /contatos | 200 | OK | 859,85 | 10 |
| sellers | /vendedores | 200 | OK | 458,56 | 10 |
| priceLists | /listas-precos | 200 | OK | 389,18 | 3 |

Resumo final informado: **cinco GETs utilizados, três restantes de oito**, connected=true, accountVerified=true, busy=false. Essa é a contagem da sessão final fornecida; a tentativa 403 anterior está registrada separadamente. Não foi fornecida a correlação entre processos/contadores; não inferir reset na reautorização. O código permanece com orçamento por processo, inclusive para falhas despachadas. A consolidação não executou nova consulta real nem utilizou os três GETs restantes.

Tempos são cinco observações individuais, não médias, benchmark, SLA ou capacidade sob carga. Três listas retornadas são apenas a amostra: total da conta não comprovado por paginação/conferência administrativa. Detalhes de produto/lista, outras páginas e pedidos existentes não foram testados. A evidência sanitizada e contagens estão em [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).
