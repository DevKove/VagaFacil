# VagaFácil API — etapa 1

API inicial para PHP 8.3 e MySQL 5.7. Não substitui ainda as chamadas do frontend/Supabase.

## Implantação

Copie o conteúdo desta pasta para:

`/home1/josev853/vagafacil-aracoiaba.com.br/api/`

A configuração permanece privada em:

`/home1/josev853/vagafacil-api/config.php`

**Não copie credenciais para esta pasta nem para o GitHub.**

## Contrato de configuração

O arquivo privado já existente deve disponibilizar o PDO de uma destas formas:

```php
return $pdo;
```

ou:

```php
return ['pdo' => $pdo];
```

ou declarar a variável `$pdo` durante o `require`.

A API não altera nem recria tabelas.

## Teste

Abra:

`https://vagafacil-aracoiaba.com.br/api/health`

Resposta esperada:

```json
{
  "ok": true,
  "service": "vagafacil-api",
  "database": "connected",
  "timestamp": "..."
}
```

Se retornar HTTP 503, consulte o error_log do PHP. A resposta pública não revela credenciais nem detalhes internos.

## Endpoints nesta etapa

- `GET /api/health` — verifica a disponibilidade da API e a conexão PDO.

Autenticação, CSRF, autorização por perfil e módulos de negócio serão implementados e testados antes de conectar o frontend.
