# Instalação local — Windows / PowerShell

Node.js 24 LTS, npm e PostgreSQL 16+ instalado (Docker não é obrigatório). [Instalador oficial PostgreSQL Windows](https://www.postgresql.org/download/windows/). Usar diretório de instalação e porta escolhidos pelo responsável; os comandos abaixo pressupõem 16 e 5432. Não reutilizar arquivo da POC. Não colocar credenciais em argumentos CLI, screenshots, Git ou chat.

```powershell
git clone https://github.com/kaue-cauin/pedidosAtram.git
Set-Location pedidosAtram
git switch etapa-7b2-backend
npm ci
$env:Path = "C:\Program Files\PostgreSQL\16\bin;" + $env:Path
# PostgreSQL já iniciado pelo serviço do instalador
pg_isready -h 127.0.0.1 -p 5432
# Cria role local; --pwprompt coleta senha, sem senha no argumento
createuser -h 127.0.0.1 -U postgres --pwprompt --no-superuser --no-createdb --no-createrole atram_backend
createdb -h 127.0.0.1 -U postgres -O atram_backend atram_backend_local
Copy-Item .env.backend.example .env.backend.local
notepad .env.backend.local
```

No arquivo local, preencher DATABASE_URL com URL PostgreSQL contendo usuário/senha locais (URL-encode de caracteres especiais). A senha do banco é diferente da senha do operador. ACL do arquivo restrita ao responsável; não usar pasta sincronizada pública. Manter todas as flags Tiny=no e Client ID/Secret vazios durante validação local.

Gerar chave aleatória localmente sem exibir no chat:

```powershell
node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {appendFileSync} from "node:fs"; appendFileSync(".env.backend.local", "\nBACKEND_ENCRYPTION_KEYS="+JSON.stringify({v1:randomBytes(32).toString("hex")})+"\nBACKEND_ACTIVE_KEY=v1\n");'
# Remover entradas vazias duplicadas das duas variáveis no arquivo antes de executar.
npm run backend:db:migrate
npm run backend:admin -- bootstrap
# Prompt solicita organização, login, senha e confirmação; senha não é exibida.
npm run backend:start
```

Serviço HTTP exclusivamente em http://127.0.0.1:8790 no desenvolvimento. /api/health e /api/ready podem ser abertos; controles exigem autenticação. O backend não tem tela administrativa completa. Encerrar com Ctrl+C; nenhum apagamento de dados na parada. Reiniciar backend mantém usuários/sessões/conexões no PostgreSQL. Navegador/CLI devem usar a origem configurada e enviar Origin/CSRF conforme ENDPOINTS.md. Não trocar 127.0.0.1 por localhost sem revisar configuração de Host/cookie/callback.

## Login e administração sem senha na linha de comando

```powershell
$cred = Get-Credential -Message 'Login e senha do operador Atram'
$body = @{login=$cred.UserName; password=$cred.GetNetworkCredential().Password} | ConvertTo-Json
$base = 'http://127.0.0.1:8790'
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Headers @{Origin=$base} -Body $body -SessionVariable session
$headers = @{Origin=$base; 'X-CSRF-Token'=$login.csrfToken}
Invoke-RestMethod "$base/api/auth/me" -WebSession $session
# Novo operador: senha vem do prompt local; papel escolhido pelo administrador
$new = Get-Credential -Message 'Login e senha inicial do novo operador'
$payload = @{login=$new.UserName;password=$new.GetNetworkCredential().Password;role='OPERADOR'} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/api/admin/users" -WebSession $session -Headers $headers -ContentType 'application/json' -Body $payload
# Logout revoga a sessão no banco
Invoke-RestMethod -Method Post -Uri "$base/api/auth/logout" -WebSession $session -Headers $headers -ContentType 'application/json' -Body '{}'
Remove-Variable body,payload,cred,new,login -ErrorAction SilentlyContinue
```

Reset usa POST /api/admin/users/:id/reset-password com password obtida de Get-Credential; desativação usa /deactivate com {}. Nenhum email automático implementado. Comunicar senha inicial por canal protegido e planejar troca obrigatória/recuperação antes de produção. API é somente backend; o formulário mock no Pages não faz login nesse serviço.

## PostgreSQL real de testes, isolado

Role distinta com CREATEDB somente para testes; banco base nomeado atram_test*. Não reutilizar DATABASE_URL comercial.

```powershell
createuser -h 127.0.0.1 -U postgres --pwprompt --no-superuser --createdb --no-createrole atram_test_runner
createdb -h 127.0.0.1 -U postgres -O atram_test_runner atram_test_local
# Preencher URL sintética LOCAL sem postar a senha. Esta variável não é DATABASE_URL.
$env:BACKEND_TEST_DATABASE_URL = Read-Host 'URL PostgreSQL do banco atram_test_local'
$env:BACKEND_TEST_DATABASE_APPROVED = 'yes'
npm run check:stage7b2
```

A suíte cria bancos atram_test_UUID, aplica migrations em banco vazio, cria ADMIN e organizações fictícias, executa testes e remove os bancos no finally. Não é necessário executar bootstrap manual no banco de testes. Para conferir limpeza:

```powershell
psql -h 127.0.0.1 -U atram_test_runner -d atram_test_local -c "SELECT datname FROM pg_database WHERE datname LIKE 'atram_test_%';"
Remove-Item Env:BACKEND_TEST_DATABASE_URL,Env:BACKEND_TEST_DATABASE_APPROVED
```

O banco base atram_test_local deve permanecer; nenhum atram_test_UUID deve sobrar. Se processo foi forçado, conferir nomes/ausência de execução antes de remover somente banco sintético criado pela suíte. Nunca executar DROP DATABASE por wildcard. O serviço PostgreSQL local pode permanecer para desenvolvimento; parada via serviço Windows encerra todo o cluster, portanto fazer somente se não houver outras aplicações usando-o.

Unidade sem banco: npm run check:stage7b2:unit. Integração sem configuração de testes falha explicitamente, sem skip silencioso. CI usa PostgreSQL temporário próprio e nenhuma credencial Tiny. Evidência CI não substitui homologação no Windows do responsável.

## OAuth real futuro — ainda pendente

Callback novo: http://127.0.0.1:8790/api/erp/tiny/oauth/callback. Cadastrar no app Tiny somente após autorização do responsável. Preencher Client ID/Secret no arquivo local protegido; nenhuma solicitação por chat. Flags OAuth/leitura/refresh só habilitadas para operação especificamente autorizada. Configure documento esperado por endpoint ADMIN da própria organização; POST start devolve authorizationUrl, navegar em browser autenticado na mesma origem, consentir, callback redireciona a status. GET /info exige ação separada verify-account. A sessão de operador usada pelo browser deve ser a original do start; sessão PowerShell não é compartilhada com navegador. Não tentar copiar token de sessão por URL. Em validação real futura usar cliente da mesma origem/autenticado ou procedimento dedicado revisado.
