# Comparação estrutural — Supabase x MySQL HostGator

**Projeto de origem:** VagaFácil — Supabase `pwuthycrlieoctlzgewh`  
**Destino planejado:** MySQL HostGator `josev853_vagafacil`  
**Escopo:** estrutura, sem copiar registros e sem executar alterações no banco de destino.  
**Compatibilidade verificada:** PostgreSQL 17 (origem) e MySQL 5.7.44 (destino).

## 1. Estrutura encontrada no Supabase

Foram identificadas 15 tabelas no schema `public`:

| Tabela | Finalidade |
|---|---|
| `profiles` | Perfis e papéis de usuários |
| `vehicles` | Veículos dos cidadãos |
| `parking_zones` | Zonas de estacionamento |
| `parking_spaces` | Vagas |
| `parking_rules` | Regras e duração |
| `holidays` | Feriados |
| `parking_sessions` | Registros de estacionamento |
| `alerts` | Alertas operacionais |
| `enforcements` | Fiscalizações |
| `enforcement_photos` | Evidências fotográficas |
| `notifications` | Notificações |
| `audit_logs` | Auditoria |
| `ads` | Banners/anúncios |
| `push_subscriptions` | Inscrições Web Push |
| `physical_card_sessions` | Registros de cartões físicos |

Tipos ENUM da origem:
- `app_role`: admin, supervisor, agent, citizen
- `parking_category`: conventional, elderly, accessible
- `parking_status`: active, expired, finished, cancelled
- `alert_status`: open, claimed, resolved, dismissed
- `enforcement_status`: in_progress, regular, irregular, closed

O banco também contém chaves primárias/estrangeiras, índices, restrições CHECK, funções, triggers e políticas RLS. Não existem views no schema public consultado.

## 2. Estrutura preparada no MySQL

O arquivo `001_schema.sql` cria 23 tabelas. Além das 15 tabelas funcionais acima, existem 8 tabelas de suporte à autenticação/operação PHP:

`app_users`, `auth_sessions`, `password_reset_tokens`, `mfa_factors`, `mfa_recovery_codes`, `active_plate_registry`, `login_attempts`, `mail_outbox`.

Essa diferença é intencional: o MySQL substitui serviços do Supabase Auth por autenticação/sessões administradas pela aplicação PHP. Os dados de autenticação do Supabase não devem ser copiados diretamente para essas tabelas sem um processo de migração específico.

## 3. Conversões necessárias e mapeamentos

| PostgreSQL | MySQL 5.7 | Observação |
|---|---|---|
| UUID | CHAR(36) ASCII | Preservar o valor textual do UUID |
| TEXT | VARCHAR/TEXT | Definir limites conforme validação da aplicação |
| BOOLEAN | TINYINT(1) | Usar 0/1 |
| TIMESTAMPTZ | DATETIME(3) UTC | Aplicação converte para America/Sao_Paulo na apresentação |
| JSONB / JSON | JSON | MySQL 5.7 não possui JSONB |
| ENUM PostgreSQL | ENUM MySQL | Reproduzir exatamente os valores |
| ARRAY de SMALLINT (`weekdays`) | JSON | Converter os dias para array JSON |
| IDENTITY | AUTO_INCREMENT | Aplicável a `audit_logs.id` |

## 4. Diferenças relevantes identificadas no DDL MySQL

1. `profiles.id` referencia `app_users.id`, em substituição a `auth.users.id`.
2. `push_subscriptions.user_id` referencia `app_users.id`, em substituição a `auth.users.id`.
3. `parking_rules.weekdays` foi convertido de array PostgreSQL para JSON.
4. `parking_sessions` possui colunas de geolocalização e categoria de beneficiário equivalentes às últimas migrações da origem.
5. `physical_card_sessions` inclui localização, nome do responsável e encerramento, conforme as migrações da origem.
6. O MySQL inclui tabelas operacionais que não existem no schema public do Supabase, pois fazem parte da implementação PHP.

## 5. Integridade referencial pendente no HostGator

Com base nas verificações anteriores do banco MySQL, 19 chaves estrangeiras estavam instaladas e quatro relações permaneciam sem constraint:

- `parking_sessions.space_id → parking_spaces.id`
- `physical_card_sessions.zone_id → parking_zones.id`
- `physical_card_sessions.space_id → parking_spaces.id`
- `physical_card_sessions.created_by → profiles.id`

As tentativas anteriores de criação dessas constraints falharam. Não repetir os ALTER TABLE automaticamente. Até que seja possível resolver isso com segurança, a API deve validar as referências dentro de transações e rejeitar IDs inexistentes.

## 6. Correção necessária no arquivo de origem

Foi identificado um escape literal `\\n` na declaração da coluna `endpoint_hash` da tabela `push_subscriptions` em `001_schema.sql`. Corrigir o arquivo versionado para que a linha termine normalmente com vírgula e quebra de linha. O banco que já foi importado não deve ser recriado por causa dessa correção.

## 7. Limites desta comparação

- Esta análise compara o schema public do Supabase com o DDL versionado e com o estado do MySQL informado nas verificações anteriores.
- Não houve conexão direta ao MySQL da HostGator nesta etapa; portanto, não é uma inspeção ao vivo do banco de destino.
- Não foram copiados registros, senhas, hashes, fatores MFA, arquivos de Storage ou dados de usuários.
- Políticas RLS não são convertidas literalmente para MySQL. As permissões equivalentes precisam ser aplicadas no backend PHP em cada endpoint.
- Funções e triggers PostgreSQL precisam ser reimplementadas como lógica PHP ou rotinas MySQL, após revisão funcional.

## 8. Próxima etapa segura

1. Obter uma exportação atual do DDL MySQL HostGator (`SHOW CREATE TABLE` para as 23 tabelas).
2. Comparar tabela por tabela com `001_schema.sql` e este levantamento.
3. Produzir um script incremental, idempotente e com verificações prévias.
4. Fazer backup antes de qualquer DDL.
5. Aplicar somente diferenças aprovadas; preservar todos os registros existentes.
