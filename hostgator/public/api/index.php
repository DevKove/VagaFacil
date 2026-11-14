<?php
declare(strict_types=1);

/**
 * VagaFácil API — PHP 8.3 / MySQL 5.7+
 * Deploy this directory as <document-root>/api.
 * Keep the database configuration outside the document root.
 */

const API_CONFIG_PATH = '/home1/josev853/vagafacil-api/config.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, private');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(self)');

if (!headers_sent() && (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;
}

/** Load the already-tested private PDO configuration without exposing it. */
function database(): PDO
{
    if (!is_file(API_CONFIG_PATH) || !is_readable(API_CONFIG_PATH)) {
        throw new RuntimeException('Private database configuration is unavailable.');
    }

    $pdo = null;
    $returned = (static function (string $path, ?PDO &$pdo): mixed {
        return require $path;
    })(API_CONFIG_PATH, $pdo);

    if ($returned instanceof PDO) {
        $pdo = $returned;
    } elseif (is_array($returned) && ($returned['pdo'] ?? null) instanceof PDO) {
        $pdo = $returned['pdo'];
    }

    if (!$pdo instanceof PDO) {
        throw new RuntimeException(
            'config.php must return a PDO instance, return ["pdo" => $pdo], or assign $pdo.'
        );
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

    return $pdo;
}

require_once __DIR__ . '/auth.php';

function requestPath(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    return is_string($path) ? rtrim($path, '/') ?: '/' : '/';
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $path = requestPath();

    if ($method === 'OPTIONS') {
        header('Allow: GET, POST, PATCH, DELETE, OPTIONS');
        http_response_code(204);
        exit;
    }

    if ($method === 'GET' && in_array($path, ['/api/health', '/health'], true)) {
        $pdo = database();
        $pdo->query('SELECT 1')->fetchColumn();

        // Validate the complete application schema without reading or changing records.
        $requiredTables = [
            'active_plate_registry', 'ads', 'alerts', 'app_users', 'audit_logs',
            'auth_sessions', 'enforcement_photos', 'enforcements', 'holidays',
            'login_attempts', 'mail_outbox', 'mfa_factors', 'mfa_recovery_codes',
            'notifications', 'parking_rules', 'parking_sessions', 'parking_spaces',
            'parking_zones', 'password_reset_tokens', 'physical_card_sessions',
            'profiles', 'push_subscriptions', 'vehicles',
        ];
        $placeholders = implode(',', array_fill(0, count($requiredTables), '?'));
        $check = $pdo->prepare(
            "SELECT TABLE_NAME FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
               AND TABLE_NAME IN ($placeholders)"
        );
        $check->execute($requiredTables);
        $existingTables = $check->fetchAll(PDO::FETCH_COLUMN);
        $missingTables = array_values(array_diff($requiredTables, $existingTables));
        $schemaReady = count($missingTables) === 0;

        respond($schemaReady ? 200 : 503, [
            'ok' => $schemaReady,
            'service' => 'vagafacil-api',
            'database' => 'connected',
            'schema' => $schemaReady ? 'ready' : 'incomplete',
            'tables_expected' => count($requiredTables),
            'tables_found' => count($existingTables),
            'missing_tables' => $missingTables,
            'timestamp' => gmdate('c'),
        ]);
    }

    $pdo = database();
    if (handleAuthRoute($pdo, $method, $path)) {
        exit;
    }

    respond(404, [
        'ok' => false,
        'error' => [
            'code' => 'NOT_FOUND',
            'message' => 'Endpoint não encontrado.',
        ],
    ]);
} catch (Throwable $exception) {
    error_log(sprintf(
        '[VagaFacil API] %s: %s in %s:%d',
        get_class($exception),
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));

    respond(503, [
        'ok' => false,
        'error' => [
            'code' => 'SERVICE_UNAVAILABLE',
            'message' => 'Serviço temporariamente indisponível.',
        ],
    ]);
}
