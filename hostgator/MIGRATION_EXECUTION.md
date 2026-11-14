# Execução da migração Supabase → HostGator

**Branch:** `migration/mysql-hostgator`  
**Destino:** PHP 8.3 + MySQL 5.7 na HostGator  
**Regra de segurança:** não desativar o Supabase, não apagar dados e não executar DDL destrutivo enquanto a migração não passar pelos testes de aceitação.

## Objetivo final

O frontend VagaFácil deve consumir exclusivamente a API PHP do próprio domínio. A API será responsável por autenticação, autorização, validação, regras de negócio, transações e acesso ao MySQL. Nenhum fluxo operacional poderá depender de Supabase Auth, Database, Edge Functions, Storage ou Realtime.

## Estado verificado

- [x] Banco MySQL contém as 23 tabelas previstas.
- [x] O levantamento de origem identificou 15 tabelas em `public` no Supabase.
- [x] Configuração PDO privada foi testada anteriormente.
- [x] Endpoint de saúde PHP foi criado no repositório (a publicação/execução na HostGator ainda precisa ser confirmada).
- [x] Corrigido no DDL versionado o escape literal `\\n` na definição de `push_subscriptions.endpoint_hash`. Isso altera apenas o arquivo-fonte, não o banco já criado.
- [ ] Backend funcional completo.
- [ ] Frontend sem dependências Supabase.
- [ ] Migração de dados e credenciais planejada e validada.
- [ ] Testes integrados na hospedagem.
- [ ] Corte definitivo do Supabase.

## Mapa de substituição

| Serviço Supabase atual | Implementação de destino |
|---|---|
| Auth: cadastro, login, sessão, recuperação | API PHP, `app_users`, `auth_sessions`, `password_reset_tokens`, `mail_outbox` |
| MFA/TOTP e códigos de recuperação | API PHP, `mfa_factors`, `mfa_recovery_codes`; segredo cifrado com chave fora do webroot |
| Database/PostgREST | PDO com prepared statements, transações e autorização por endpoint |
| RLS | Política centralizada no backend: identidade, papel, propriedade do registro e estado ativo |
| Edge Function `manage-users` | Rotas administrativas PHP com validação de papel e auditoria |
| Edge Function `send-web-push` | Serviço PHP de envio push e fila persistente |
| Storage | Armazenamento privado/público controlado na HostGator, com validação MIME, tamanho e autorização |
| Realtime | Atualização por polling incremental inicialmente; avaliar SSE apenas se suportado pela hospedagem |
| RPC, funções e triggers | Serviços transacionais PHP e constraints/índices MySQL equivalentes |

## Ordem obrigatória de implementação

### Fase 1 — Fundação e segurança
- [ ] Router API versionado, respostas JSON uniformes, validação de método e payload.
- [ ] PDO privado, transações, logs sem segredos e tratamento de exceções.
- [ ] Sessões opacas com token aleatório, hash no banco, cookie HttpOnly/Secure/SameSite e proteção CSRF.
- [ ] Rate limit de login, bloqueio progressivo e mensagens que não revelem se um e-mail existe.
- [ ] Autorização server-side por papel e propriedade; nunca confiar no papel enviado pelo navegador.
- [ ] CORS restrito à origem oficial; nenhuma chave administrativa no frontend.

### Fase 2 — Identidade
- [ ] Login/logout/consulta de sessão.
- [ ] Cadastro cidadão e confirmação de e-mail.
- [ ] Recuperação e redefinição de senha por token de uso único.
- [ ] MFA TOTP e códigos de recuperação para perfis administrativos/agentes, com verificação no servidor.
- [ ] Gestão administrativa de usuários, ativação/bloqueio e alteração de papéis.

### Fase 3 — Operação do cidadão
- [ ] CRUD de veículos.
- [ ] Consulta de vagas/zonas e regras.
- [ ] Iniciar/encerrar estacionamento com transação e proteção contra placa/veículo/usuário/vaga duplicados.
- [ ] Aplicar regras de tempo, feriados, categoria especial e captura de geolocalização no servidor.
- [ ] Histórico e notificações.

### Fase 4 — Operação administrativa
- [ ] Painel de sessões, alertas e fiscalização.
- [ ] Cartões físicos e registro de placa ativa compartilhado com sessões de cidadãos.
- [ ] Zonas, vagas, regras e feriados.
- [ ] Anúncios, upload e entrega de imagens.
- [ ] Relatórios e exportações.
- [ ] Auditoria de ações sensíveis.

### Fase 5 — Serviços auxiliares
- [ ] Push subscriptions e envio Web Push.
- [ ] Fila de e-mail e processamento SMTP.
- [ ] Atualização incremental para substituir Realtime.
- [ ] Política de retenção, limpeza de sessões expiradas e observabilidade.

### Fase 6 — Corte
- [ ] Migrar dados necessários do Supabase sem copiar hashes/sessões incompatíveis sem procedimento próprio.
- [ ] Conferir contagens e integridade referencial.
- [ ] Executar testes automatizados e testes reais por perfil.
- [ ] Validar backup e restauração.
- [ ] Publicar frontend apontando apenas para a API HostGator.
- [ ] Monitorar antes de revogar/desligar os serviços Supabase.

## Critérios de aceite

1. Busca no bundle e no código de produção não encontra chamadas operacionais ao Supabase.
2. Login, cadastro, recuperação e MFA funcionam sem Supabase.
3. Todas as operações são autorizadas no servidor e testadas com perfis cidadão, agente e administrador.
4. Regras de estacionamento e unicidade são aplicadas atomicamente no MySQL.
5. Uploads, anúncios, push, e-mail e relatórios funcionam sem serviços Supabase.
6. Testes de regressão confirmam preservação de registros e comportamento funcional.
7. O Supabase só é desligado após aprovação explícita do usuário e backup validado.

## Limitações conhecidas que exigem atenção

- As quatro chaves estrangeiras previamente identificadas como ausentes no MySQL não devem ser recriadas às cegas; primeiro diagnosticar os motivos e conferir dados existentes.
- O DDL versionado é referência de implementação, não prova que a estrutura em produção esteja idêntica.
- Não há acesso direto de leitura ao MySQL HostGator por esta integração. A validação de hospedagem depende do endpoint PHP e de resultados de execução fornecidos pela própria hospedagem.
- Não marcar uma fase como concluída apenas porque os arquivos foram commitados: exigir build/testes e validação no ambiente real.
