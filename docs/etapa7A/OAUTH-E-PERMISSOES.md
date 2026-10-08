# OAuth e permissões

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Contrato confirmado

Fonte: [autenticação V3](https://api-docs.erp.olist.com/documentacao/comecando/autenticacao) e [criação de aplicativo](https://api-docs.erp.olist.com/documentacao/comecando/criando-um-aplicativo).

| Passo | Contrato publicado | Requisito de projeto |
|---|---|---|
| Cadastro privado | Menu Configurações → Geral → Aplicativos; nome, redirect URL, Client ID/Secret, módulos | Conta Atram e responsável; exclusivamente leitura em 7A |
| Autorizar | `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` | `client_id`, `redirect_uri`, `scope=openid`, `response_type=code`; adicionar state aleatório de uso único vinculado à sessão |
| Callback | Redirect recebe código de autorização | URI HTTPS exata registrada; validar state, sessão/empresa, erro e expiração antes da troca; rejeitar replay |
| Trocar código | POST OAuth `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token` | Form URL encoded: `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri`, `code`; exclusivamente no servidor |
| Recursos | `Authorization: Bearer access_token` | Tokens restritos ao backend; autenticação própria do operador |
| Expiração | Documento informa access token 4 horas e refresh token 1 dia | Na implementação, observar `expires_in` efetivo; relógio com margem, não presumir sessão indefinida |
| Renovar | Mesmo endpoint token; `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token` | Renovação serializada por conexão; armazenar novos tokens atomicamente, tratar eventual rotação |

POST de troca/renovação OAuth é autenticação, não escrita de pedido; **nem ele foi executado em 7A**. Cadastro de aplicativo, vínculo, autorização e leitura autenticada continuam pendentes.

## Confirmações e questões abertas

A central informa API a partir do plano Construa, extensão Gestão de Aplicativos, até cinco aplicativos por conta e login disponível a usuários além do administrador. Isso não confirma o plano Atram nem dá a dez operadores dez quotas. Autorizar com usuário de integração de leitura é proposta; confirmar responsável, segregação e política da empresa. Não compartilhar login ERP entre operadores: o acesso deles à aplicação terá sessão e autorização próprias.

Mudança de permissões: a documentação técnica pede nova autenticação; a ajuda orienta regenerar o Client Secret e salvar. Planejar rotação segura seguida de reautorização; confirmar sequência na conta. Renovar chaves invalida antigas segundo a ajuda.

**NÃO CONFIRMADOS:** suporte/exigência de PKCE, parâmetro state no contrato do provedor (validação local será obrigatória), endpoint de revogação/logout, rotação/reutilização de refresh, campos/códigos de erros OAuth, comportamento com múltiplas autorizações, expiração de código, binding de conta no token, ambiente sandbox. Não inventar `/revoke` por convenção Keycloak. Verificar metadata publicada/suporte antes da POC, sem adivinhar endpoints. Se PKCE for suportado, usar S256; se exigido e não esclarecido, bloquear teste até esclarecer.

401 no recurso pode representar token ou módulo sem permissão, conforme ajuda. 403 exige revisar usuário/permissão. Não renovar infinitamente; uma renovação controlada para GET, depois reconectar. `invalid_grant` é hipótese a tratar defensivamente, não erro empiricamente confirmado. Refresh expirado: encerrar conexão ERP e pedir nova autorização sem perder rascunho.

## Segurança e POC pendente

Nenhum Client Secret/token em navegador, Git, relatórios, prompts ou `NEXT_PUBLIC_*`. Segredos no ambiente seguro, tokens cifrados em armazenamento durável com acesso restrito. Redigir logs de headers, query callback/code e corpos OAuth. Cookies da aplicação HttpOnly/Secure, CSRF, sessão vinculada à empresa. Callback não aceitar redirect arbitrário. O Pages não guarda segredos.

POC futura somente com runtime seguro e credenciais configuradas fora desta conversa: allowlist de GETs, 1 tentativa por leitura e orçamento máximo de 8 chamadas de recursos (incluindo um detalhe opcional). `/info`, uma página pequena de `/produtos`, uma de `/contatos`, `/vendedores`, `/listas-precos`, até um detalhe necessário e um pedido existente por ID informado, se permitido. Não descobrir IDs comerciais por varredura. Separar orçamento OAuth (uma troca e eventual renovação autorizada); não testar renovação sem necessidade.

Registrar somente recurso/método, duração, status, contagem de itens e headers de quota; omitir nomes, documentos, endereços, IDs reais e tokens do relatório público. Nenhum retry em laço nem operações CRUD. Testes de state inválido/replay podem ser locais com mocks. Testes de conta/permissões, refresh e leituras: **NÃO EXECUTADOS**, por ausência de ambiente seguro com credenciais autorizadas. Não foi criado código de POC, backend ou `check:stage7a`; a entrega é documental.
