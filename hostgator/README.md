# Migração HostGator — VagaFácil

## Estado
- Branch isolada: `migration/mysql-hostgator`.
- Banco MySQL HostGator testado via PDO com sucesso.
- Esta etapa contém somente o esquema inicial; não altera o Supabase nem o banco de produção.
- Aplicação ainda usa Supabase até a conclusão da API PHP e da migração de dados.

## Arquitetura de destino
`React/PWA → HTTPS API PHP 8.3 → PDO/MySQL`

A configuração do banco deve ficar fora do DocumentRoot em:
`/home1/josev853/vagafacil-api/config.php`

Não versionar `config.php`, senhas, chaves VAPID, chaves de criptografia ou tokens.

## Compatibilidade confirmada\nO servidor HostGator reportou MySQL `5.7.44-48`. O DDL foi ajustado para MySQL 5.7; assinaturas Web Push devem persistir `endpoint_hash` como SHA-256 do endpoint para garantir unicidade sem índice longo em utf8mb4.\n\n## Esquema
O arquivo `database/001_schema.sql` cria as 15 tabelas funcionais existentes no PostgreSQL e as tabelas auxiliares de autenticação:
- `app_users`, `auth_sessions`, `password_reset_tokens`, `mfa_factors`, `mfa_recovery_codes`, `login_attempts`, `mail_outbox`.
- `active_plate_registry` garante unicidade de placa ativa entre registros de cidadão e cartão físico, com reserva transacional.

UUIDs são preservados como `CHAR(36)`. Datas são armazenadas em UTC (`DATETIME(3)`); regras usam `America/Sao_Paulo`. Campos PostgreSQL `jsonb` e arrays são representados como JSON.

## Migração de identidade
Senhas e fatores TOTP não são exportados nesta etapa. Contas serão importadas com redefinição obrigatória de senha; usuários administrativos e agentes deverão cadastrar novamente o autenticador. Os IDs de usuário serão preservados para manter todas as relações.

## Sequência segura
1. Confirmar versão MySQL/MariaDB do HostGator e executar o DDL em banco vazio.
2. Implementar API PHP com sessão opaca em cookie HttpOnly/Secure/SameSite, CSRF, rate limit, autorização por perfil e prepared statements.
3. Implementar operações transacionais de estacionamento, alertas, fiscalização, anúncios, notificações e administração.
4. Migrar dados em lotes com IDs preservados e reconciliação de contagens.
5. Copiar os 2 buckets do Storage e configurar envio de e-mail e Web Push.
6. Adaptar o frontend para a API PHP e validar fluxos de cidadão, agente e administrador.
7. Fazer corte somente após testes e backup; manter Supabase disponível até então.

## Importante
Não importar este esquema por cima de tabelas existentes sem backup e sem conferir a versão do servidor. O script usa recursos de MySQL 5.7.44+ (JSON, colunas geradas e índices).
