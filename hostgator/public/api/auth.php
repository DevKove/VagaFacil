<?php
declare(strict_types=1);

/**
 * First-party authentication endpoints for the HostGator migration.
 * Administrative roles remain blocked until server-side TOTP verification
 * is implemented; never bypass the existing MFA requirement.
 */

function apiIsHttps(): bool
{
    return isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && $_SERVER['HTTPS'] !== 'off';
}

function apiJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    try {
        $value = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        respond(400, ['ok' => false, 'error' => ['code' => 'INVALID_JSON', 'message' => 'Corpo JSON inválido.']]);
    }
    if (!is_array($value)) {
        respond(400, ['ok' => false, 'error' => ['code' => 'INVALID_BODY', 'message' => 'O corpo da requisição deve ser um objeto JSON.']]);
    }
    return $value;
}

function apiCookieOptions(int $expires): array
{
    return [
        'expires' => $expires,
        'path' => '/api',
        'secure' => apiIsHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function apiSetAuthCookies(string $token, string $csrf, int $expires): void
{
    setcookie('vf_session', $token, apiCookieOptions($expires));
    $csrfOptions = apiCookieOptions($expires);
    $csrfOptions['httponly'] = false;
    setcookie('vf_csrf', $csrf, $csrfOptions);
}

function apiClearAuthCookies(): void
{
    setcookie('vf_session', '', apiCookieOptions(time() - 3600));
    $csrfOptions = apiCookieOptions(time() - 3600);
    $csrfOptions['httponly'] = false;
    setcookie('vf_csrf', '', $csrfOptions);
}

function apiRequireCsrf(PDO $pdo, array $session): void
{
    $cookie = (string)($_COOKIE['vf_csrf'] ?? '');
    $header = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($cookie === '' || $header === '' || !hash_equals($cookie, $header)
        || !hash_equals((string)$session['csrf_hash'], hash('sha256', $header))) {
        respond(403, ['ok' => false, 'error' => ['code' => 'CSRF_INVALID', 'message' => 'A validação de segurança expirou. Atualize a página e tente novamente.']]);
    }
}

function apiCurrentSession(PDO $pdo): ?array
{
    $token = (string)($_COOKIE['vf_session'] ?? '');
    if ($token === '' || strlen($token) < 40) return null;

    $query = $pdo->prepare(
        'SELECT s.id AS session_id, s.user_id, s.csrf_hash, s.expires_at,
                p.full_name, p.role, p.is_active, u.email, u.status
         FROM auth_sessions s
         INNER JOIN app_users u ON u.id = s.user_id
         INNER JOIN profiles p ON p.id = s.user_id
         WHERE s.token_hash = :token_hash AND s.expires_at > UTC_TIMESTAMP(3)
         LIMIT 1'
    );
    $query->execute(['token_hash' => hash('sha256', $token)]);
    $session = $query->fetch();
    if (!$session || $session['status'] !== 'active' || !(bool)$session['is_active']) return null;

    $touch = $pdo->prepare('UPDATE auth_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = :id');
    $touch->execute(['id' => $session['session_id']]);
    return $session;
}

function handleAuthRoute(PDO $pdo, string $method, string $path): bool
{
    if ($method === 'POST' && $path === '/api/auth/login') {
        $body = apiJsonBody();
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '' || strlen($password) > 1024) {
            respond(422, ['ok' => false, 'error' => ['code' => 'VALIDATION_ERROR', 'message' => 'Informe um e-mail e uma senha válidos.']]);
        }

        $identifierHash = hash('sha256', $email);
        $attempts = $pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE identifier_hash = :identifier AND attempted_at >= (UTC_TIMESTAMP(3) - INTERVAL 15 MINUTE) AND succeeded = 0'
        );
        $attempts->execute(['identifier' => $identifierHash]);
        if ((int)$attempts->fetchColumn() >= 10) {
            respond(429, ['ok' => false, 'error' => ['code' => 'LOGIN_RATE_LIMITED', 'message' => 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.']]);
        }

        $query = $pdo->prepare(
            'SELECT u.id, u.email, u.password_hash, u.status, u.locked_until,
                    p.full_name, p.role, p.is_active
             FROM app_users u INNER JOIN profiles p ON p.id = u.id
             WHERE u.email = :email LIMIT 1'
        );
        $query->execute(['email' => $email]);
        $user = $query->fetch();

        $valid = $user
            && $user['status'] === 'active'
            && (bool)$user['is_active']
            && !empty($user['password_hash'])
            && (empty($user['locked_until']) || strtotime((string)$user['locked_until'] . ' UTC') <= time())
            && password_verify($password, (string)$user['password_hash']);

        $recordAttempt = $pdo->prepare(
            'INSERT INTO login_attempts (identifier_hash, attempted_at, succeeded) VALUES (:identifier, UTC_TIMESTAMP(3), :succeeded)'
        );
        $recordAttempt->execute(['identifier' => $identifierHash, 'succeeded' => $valid ? 1 : 0]);

        if (!$valid) {
            if ($user) {
                $update = $pdo->prepare(
                    'UPDATE app_users
                     SET failed_login_attempts = LEAST(failed_login_attempts + 1, 1000),
                         locked_until = CASE WHEN failed_login_attempts + 1 >= 5
                           THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE) ELSE locked_until END
                     WHERE id = :id'
                );
                $update->execute(['id' => $user['id']]);
            }
            respond(401, ['ok' => false, 'error' => ['code' => 'INVALID_CREDENTIALS', 'message' => 'E-mail ou senha inválidos, ou acesso indisponível.']]);
        }

        // Do not create a privileged session until TOTP verification is available.
        if (in_array($user['role'], ['admin', 'supervisor', 'agent'], true)) {
            respond(503, ['ok' => false, 'error' => ['code' => 'MFA_MIGRATION_PENDING', 'message' => 'O acesso administrativo está temporariamente indisponível durante a migração segura do MFA.']]);
        }

        $token = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));
        $expires = time() + (14 * 86400);
        $expiresAt = gmdate('Y-m-d H:i:s', $expires);

        $pdo->beginTransaction();
        try {
            $insert = $pdo->prepare(
                'INSERT INTO auth_sessions (user_id, token_hash, csrf_hash, expires_at, last_seen_at, ip_hash, user_agent)
                 VALUES (:user_id, :token_hash, :csrf_hash, :expires_at, UTC_TIMESTAMP(3), :ip_hash, :user_agent)'
            );
            $insert->execute([
                'user_id' => $user['id'],
                'token_hash' => hash('sha256', $token),
                'csrf_hash' => hash('sha256', $csrf),
                'expires_at' => $expiresAt,
                'ip_hash' => hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '')),
                'user_agent' => substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 512),
            ]);
            $update = $pdo->prepare(
                'UPDATE app_users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = :id'
            );
            $update->execute(['id' => $user['id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        apiSetAuthCookies($token, $csrf, $expires);
        respond(200, [
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'role' => $user['role'],
                'is_active' => (bool)$user['is_active'],
            ],
        ]);
    }

    if ($method === 'GET' && $path === '/api/auth/me') {
        $session = apiCurrentSession($pdo);
        if (!$session) {
            apiClearAuthCookies();
            respond(401, ['ok' => false, 'error' => ['code' => 'UNAUTHENTICATED', 'message' => 'Sessão não encontrada ou expirada.']]);
        }
        respond(200, [
            'ok' => true,
            'csrf_token' => (string)($_COOKIE['vf_csrf'] ?? ''),
            'user' => [
                'id' => $session['user_id'],
                'email' => $session['email'],
                'full_name' => $session['full_name'],
                'role' => $session['role'],
                'is_active' => (bool)$session['is_active'],
            ],
        ]);
    }

    if ($method === 'POST' && $path === '/api/auth/logout') {
        $session = apiCurrentSession($pdo);
        if ($session) {
            apiRequireCsrf($pdo, $session);
            $delete = $pdo->prepare('DELETE FROM auth_sessions WHERE id = :id');
            $delete->execute(['id' => $session['session_id']]);
        }
        apiClearAuthCookies();
        respond(200, ['ok' => true]);
    }

    return false;
}
