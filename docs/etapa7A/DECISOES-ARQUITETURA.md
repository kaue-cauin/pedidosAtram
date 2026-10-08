# Decisões de arquitetura — preparação da Etapa 7B

Verificado em **08/10/2026 (UTC)**. Escopo: descoberta documental; nenhuma chamada autenticada nem escrita no ERP. “Confirmado” significa publicado na fonte oficial, não homologado na conta Atram.

## Hospedagem

O protótipo é exportado como site estático no GitHub Pages. [Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) publica HTML/CSS/JS; não executa OAuth confidencial, Client Secret, backend Node ou acesso seguro a PostgreSQL. Nenhuma migração foi realizada. Next.js admite [hospedagem Node](https://nextjs.org/docs/app/guides/self-hosting); selecionar runtime compatível com o projeto, sem trocar framework.

| Critério | A: frontend estático + backend separado | B: frontend e API em hospedagem Node / mesmo domínio |
|---|---|---|
| Segurança | Possível com backend; exige CORS allowlist, cookies/CSRF entre origens, redirects corretos | Sessão/callback e API na mesma origem simplificam a configuração; segredos continuam só no servidor |
| Simplicidade | Preserva Pages, dois deploys/configurações | Um domínio público e configuração de sessão mais simples |
| Manutenção | Front/back versões e observabilidade coordenadas | Reutiliza projeto Next, mas exige operar runtime/worker/DB |
| Offline | Front continua com cache local | Pode preservar mesmo modelo; testes de SW/offline precisam acompanhar migração |
| Custo | Pages atual + backend/DB/worker pagos ou franquias | Runtime + DB + worker; custo depende de fornecedor e carga |
| Migração | Menor mudança inicial na UI | Planejar basePath, callbacks, cache e dados locais por origem |

**Recomendação B para a produção futura**, por simplificar autenticação, callback e controle por empresa em uma origem, mantendo arquitetura local de elaboração. Não é decisão de fornecedor/preço; nenhum custo cotado nem serviço contratado. A pode servir de transição se a empresa priorizar conservar Pages, com complexidade adicional explícita. Uma POC isolada de leitura não exige migração agora.

## Componentes propostos, ainda não implementados

Frontend conserva autocomplete local, inclusão em memória primeiro, autosave/fila IndexedDB depois, totais incrementais e recuperação. Rede/sincronização/envio não entram no caminho por tecla. Offline permite elaborar, mas exige política de validade dos preços e revisão ao reconectar. Service worker futuro não deve cachear OAuth, tokens, callbacks ou respostas privadas genéricas. Dados locais precisam de isolamento por empresa/usuário e retenção; limpar IndexedDB continua não sendo backup.

Backend/BFF: sessões próprias por operador, autorização por empresa/módulo, OAuth confidencial, callbacks state/PKCE quando suportado, vault de tokens, refresh serializado, cliente GET allowlisted e rate limit central por conta. Sincronizador publica catálogo versionado com projeções mínimas. PostgreSQL futuro guarda conexões cifradas, snapshots, pedidos e ledger de tentativas; nenhuma conexão SQL no navegador. Worker/fila durável coordena sync/reconciliação; infraestrutura e schemas não adicionados em 7A.

O ledger é necessário, mas não cria atomicidade com ERP. `ERPProvider` atual exige recibo associado ao conteúdo e `findRejection` definitivo; adaptar provider real só quando contratos suportarem essas certezas, ou evoluir explicitamente para estados de consulta incerta. Não tratar GET vazio como ausência autoritativa. Separar validação comercial, intenção durável, envio, recibo e evidência de reconciliação. Não habilitar criação automaticamente na 7B.

Mudança de domínio/origem não transporta IndexedDB automaticamente. Planejar exportação/importação autorizada ou manutenção da origem antiga para recuperação antes da migração, preservando IDs, tentativas congeladas e estado UNKNOWN. Novos snapshots não podem alterar pedidos congelados ou apagar histórico.

## Decisões do usuário/empresa antes da conexão

| Decisão ou informação | Responsável / consequência |
|---|---|
| Plano, extensões, módulos, apps concorrentes e quota real | Administrador ERP; orçamento e disponibilidade |
| Usuário de integração, empresa autorizada, permissões de leitura | Administrador; delimita acesso e POC |
| Ambiente seguro, domínio/callback e credenciais configuradas nele | Responsável técnico; nenhum segredo em chat/GitHub |
| Preço base/promocional, lista por cliente, descontos e override | Comercial; define preço válido e revisão |
| Unidades, caixa/múltiplo, pesos, decimais/arredondamento | Comercial/ERP; impede conversões incorretas |
| Parcelas, formas de recebimento, banco, categoria, natureza, frete | Operação/financeiro; resolver IDs e requisitos ausentes |
| Garantias idempotentes/reconciliação e tratamento de ambiguidade | ERP/suporte e empresa; risco crítico para escrita |
| Provedor, orçamento, backup, retenção e acesso por operador | Empresa/técnico; escolher hospedagem sem custos inventados |
| Política de dados pessoais e catálogo offline | Empresa; limitar exposição e retenção |

## Sequência recomendada para 7B, sob aprovação explícita

1. Resolver ambiente seguro/conta/credenciais e lacunas prioritárias com suporte; executar somente POC de OAuth e GET com relatório sanitizado.
2. Construir backend de leitura, sessão por empresa/operador e snapshot de catálogo; validar projeções, contrato e orçamento reais.
3. Repetir 10/50/100/150/200/300 itens com autosave ativo e catálogo real sanitizado, medindo UI separada da persistência; rede lenta/offline não pode retardar campo Produto.
4. Projetar ledger e reconciliação conservadora; garantir que UNKNOWN continue bloqueado após crash. Planejar ensaios de escrita somente em etapa/ambiente explicitamente autorizados com contratos comprovados.

**PARAR em 7A.** Análise documental aprovada não significa OAuth homologado, produção liberada ou permissão para criar pedidos. Nenhuma 7B iniciada.
