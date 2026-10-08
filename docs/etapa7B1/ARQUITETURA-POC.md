# Arquitetura da POC 7B.1

Data: **08/10/2026**. **Estado atual: implementação concluída e prova operacional de OAuth/leitura aprovada para os cinco recursos testados**, com base na evidência fornecida pelo responsável. Validação comercial completa e infraestrutura definitiva continuam pendentes. A entrega inicial precedeu essa homologação; seu histórico está identificado abaixo. Evidência: [HOMOLOGACAO-REAL.json](HOMOLOGACAO-REAL.json).

## Escopo implementado

Serviço temporário em `integrations/tiny-poc/`, executado por Node 24 no repositório existente. Sem dependências novas, PostgreSQL, sincronização completa ou conexão ao frontend. A aplicação Next/Pages e o MockERPProvider continuam com seus dados e fluxos atuais.

| Módulo | Responsabilidade |
|---|---|
| config.ts | Pré-requisitos explícitos, configuração local, allowlist, callbacks e confirmação de PKCE |
| oauth.ts | Authorization code, state/cookie de sessão, S256 condicional, consumo único, tokens em memória, expiração/refresh |
| transport.ts | Timeout incluindo corpo, limite de bytes, JSON, redirect bloqueado, erros sem corpo/segredos |
| contracts.ts | Inspeção estrutural dos campos de interesse e relatório de presença/tipos, sem DTO integral |
| read-client.ts | GETs serializados, conta antes do catálogo, orçamento total de oito chamadas, pausas por quota |
| server.ts | HTTP local protegido, Host/Origin, controles de diagnóstico, callback e desconexão |
| scripts/tiny-poc.mjs | Inicialização fail-closed e encerramento do processo |
| scripts/check-stage-7b1.mjs | Testes Node, fetch externo substituído por mocks e HTTP real apenas em loopback |

Bind exclusivamente `127.0.0.1`. A configuração aceita apenas `http://127.0.0.1:PORT/oauth/callback`, porta 1024–65535, sem query/userinfo/fragmento, correspondente exatamente à URI cadastrada. **O callback específico http://127.0.0.1:8787/oauth/callback foi aceito na sessão real relatada pelo responsável**; isso não homologa outras portas/origens nem hospedagem pública. Caso o ERP exija HTTPS, não abrir este serviço em 0.0.0.0 nem alterar o gate para publicar; projetar um ambiente HTTPS protegido e rever configuração/testes primeiro.

Controle por credencial local própria: Bearer para cliente administrativo local ou Basic (usuário `poc`) para navegação local. A chave de administração não é Client Secret nem token ERP. Ela exige configuração segura, comprimento mínimo de 32 caracteres e nunca aparece em relatórios/URLs. O navegador pode autenticar-se no controle local, mas não recebe Client Secret, access token, refresh token ou DTO real. Basic somente no loopback da máquina confiável; não há deploy público autorizado. Host exato evita DNS rebinding; Origin/Sec-Fetch-Site restringem controles e relatório à origem local. /status é leitura autenticada sem efeitos e aceita a cadeia de redirect OAuth externa; não há CORS para leitura por outra página. Callback requer state + cookie HttpOnly/SameSite=Lax, de cinco minutos; esta exceção recebe o redirect externo legítimo sem abrir diagnósticos públicos.

Tokens ficam em campos privados em memória, não em disco ou armazenamento do navegador. JSON.stringify das sessões/clientes não expõe esses campos. Não há persistência, chave de criptografia, banco de tokens nem revogação remota. Desconectar invalida sessão e pending state; troca/refresh atrasados não restauram tokens. Memória JavaScript não garante zeroização física; processo deve ser temporário, sem dumps/inspeção não autorizada. Sessão e servidor expiram em 30 minutos. Encerrar processo perde a conexão e exige OAuth novo.

Sem logs HTTP de URLs, callback, headers ou corpos. Diagnóstico só expõe enum de recurso, status, duração, quota numérica e contagens de campos. Cache-Control no-store, Referrer-Policy no-referrer e CSP restritiva. O callback redireciona para /status removendo código/state da URL. Servidor não tem CORS público, rotas ERP genéricas, método de criar/alterar dados ou acesso a pedidos existentes. POST local de controle não é POST de dados ERP; o único POST externo é troca/refresh no endpoint OAuth oficial.

## Execução e gate real

1. Responsável confirma os sete pré-requisitos descritos em OAUTH-VALIDADO.md e registra a autorização de leitura e PKCE fora do repositório público.
2. Em máquina confiável, administrador injeta variáveis de ambiente/segredos por mecanismo protegido. `.env.example` é inerte; nunca enviar valores pelo chat. Se usar `.env.tiny-poc.local`, manter fora do Git (ignorado), acesso só do operador (ex.: 0600 em POSIX) e proteção equivalente no Windows. Não colocar tokens manualmente nesse arquivo.
3. `npm run poc:tiny` usa exclusivamente o ambiente já configurado. Alternativa local Node: `node --env-file=.env.tiny-poc.local scripts/tiny-poc.mjs`. Não executar no CI com credenciais reais, não publicar no Pages e não gravar sessão por ferramentas de captura.
4. No navegador local, abrir `/oauth/start` na origem configurada e autenticar no controle local; o usuário autorizado faz login diretamente no domínio oficial Tiny. Não inserir credencial ERP neste serviço.
5. Usar um cliente administrativo local protegido (sem verbose/log de headers) para POST `/read?resource=info`. Só continuar se outcome=OK e accountVerified=true. Executar uma leitura de cada recurso autorizado. Não usar comandos que expandam segredos em argumentos de processo.
6. GET `/report` entrega somente métricas sanitizadas. POST `/disconnect` encerra localmente; também pode encerrar processo. Não confundir desconexão com revogação no provedor.

O exemplo não inclui valores fictícios que pareçam credenciais funcionais; variáveis vazias/inertes produzem CONFIG_PENDING. Falha de pré-requisito ocorre antes de abrir servidor ou chamar o provedor.

## Limites da segurança/validação

É uma POC de uma conexão local, não autenticação multiusuário de produção, autorização definitiva por empresa ou garantia distribuída. Client ID/Secret e cadastro de aplicativo são responsabilidade do administrador. A comparação de CPF/CNPJ esperado ocorre apenas no servidor, sem gravar documento em relatório. Autorizar OAuth não prova leitura dos módulos: cada GET é avaliado separadamente. Revisão estrutural parcial não comprova elegibilidade comercial, preço, estoque ou impostos.

## Estado operacional posterior — 08/10/2026

A sessão local relatada pelo responsável comprova OAuth com configuração S256, callback em 127.0.0.1:8787, identidade da empresa verificada e cinco GETs protegidos. A implementação e arquitetura não foram modificadas para essa consolidação. [Evidência sanitizada](HOMOLOGACAO-REAL.json).

Conforme declaração recebida, Client Secret permaneceu em arquivo local protegido, tokens não foram enviados ao chat e nenhuma escrita de dados foi executada. Os dados recebidos são contagens/campos/métricas, sem resposta comercial integral ou segredos. A IA conferiu os documentos recebidos/alterados, mas não realizou auditoria forense do computador, dos arquivos locais ou do armazenamento. Loopback e limite de sessão de 30 minutos permanecem características da POC; desconectar não implica revogação remota. Não iniciar backend operacional nesta consolidação.
