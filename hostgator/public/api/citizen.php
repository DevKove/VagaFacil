<?php
declare(strict_types=1);

/** Citizen application endpoints. All identity comes from the server session. */

function citizenSession(PDO $pdo, string $method): array
{
    $session = apiCurrentSession($pdo);
    if (!$session || $session['role'] !== 'citizen') {
        respond(401, ['ok' => false, 'error' => ['code' => 'UNAUTHENTICATED', 'message' => 'Entre novamente para continuar.']]);
    }
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) apiRequireCsrf($pdo, $session);
    return $session;
}

function citizenUuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function citizenIsoDateTime(mixed $value): ?string
{
    if (!is_string($value) || $value === '') return null;
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\\TH:i:s.v\\Z');
}

function citizenRows(PDO $pdo, string $sql, array $params = []): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll();
}

function handleCitizenRoute(PDO $pdo, string $method, string $path): bool
{
    if ($path === '/api/citizen/bootstrap' && $method === 'GET') {
        $session = citizenSession($pdo, $method);
        $userId = $session['user_id'];

        $vehicles = citizenRows($pdo,
            'SELECT id, plate, make, model, color, vehicle_type, created_at
             FROM vehicles WHERE owner_id = :user_id ORDER BY created_at DESC',
            ['user_id' => $userId]
        );

        $parkingSessions = citizenRows($pdo,
            'SELECT ps.id, ps.plate_snapshot, ps.started_at, ps.expires_at, ps.ended_at,
                    ps.status, ps.space_id, ps.latitude, ps.longitude, ps.location_accuracy_m,
                    ps.location_captured_at, ps.beneficiary_category,
                    sp.code AS space_code, z.name AS zone_name
             FROM parking_sessions ps
             LEFT JOIN parking_spaces sp ON sp.id = ps.space_id
             LEFT JOIN parking_zones z ON z.id = sp.zone_id
             WHERE ps.user_id = :user_id ORDER BY ps.started_at DESC',
            ['user_id' => $userId]
        );
        foreach ($parkingSessions as &$row) {
            $row['started_at'] = citizenIsoDateTime($row['started_at']);
            $row['expires_at'] = citizenIsoDateTime($row['expires_at']);
            $row['ended_at'] = citizenIsoDateTime($row['ended_at']);
            $row['location_captured_at'] = citizenIsoDateTime($row['location_captured_at']);
            $row['parking_spaces'] = $row['space_id'] ? [
                'code' => $row['space_code'],
                'parking_zones' => $row['zone_name'] ? ['name' => $row['zone_name']] : null,
            ] : null;
            unset($row['space_code'], $row['zone_name']);
        }
        unset($row);

        $spaces = citizenRows($pdo,
            'SELECT sp.id, sp.code, sp.category, sp.zone_id, z.name AS zone_name
             FROM parking_spaces sp LEFT JOIN parking_zones z ON z.id = sp.zone_id
             WHERE sp.active = 1 ORDER BY sp.code'
        );
        foreach ($spaces as &$row) {
            $row['parking_zones'] = $row['zone_name'] ? ['name' => $row['zone_name']] : null;
            unset($row['zone_name']);
        }
        unset($row);

        $notifications = citizenRows($pdo,
            'SELECT id, title, body, kind, read_at, created_at
             FROM notifications WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 100',
            ['user_id' => $userId]
        );
        foreach ($notifications as &$notice) {
            $notice['created_at'] = citizenIsoDateTime($notice['created_at']);
            $notice['read_at'] = citizenIsoDateTime($notice['read_at']);
        }
        unset($notice);
        respond(200, ['ok' => true, 'vehicles' => $vehicles, 'sessions' => $parkingSessions, 'spaces' => $spaces, 'notifications' => $notifications]);
    }

    if ($path === '/api/citizen/vehicles' && $method === 'POST') {
        $session = citizenSession($pdo, $method);
        $body = apiJsonBody();
        $plate = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($body['plate'] ?? '')));
        if (!preg_match('/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/', $plate)
            && !preg_match('/^[A-Z]{3}[0-9]{4}$/', $plate)) {
            respond(422, ['ok' => false, 'error' => ['code' => 'INVALID_PLATE', 'message' => 'Informe uma placa válida no padrão ABC1D23 ou ABC1234.']]);
        }
        $id = citizenUuid();
        try {
            $insert = $pdo->prepare(
                'INSERT INTO vehicles (id, owner_id, plate, make, model, color)
                 VALUES (:id, :owner_id, :plate, :make, :model, :color)'
            );
            $insert->execute([
                'id' => $id, 'owner_id' => $session['user_id'], 'plate' => $plate,
                'make' => trim((string)($body['make'] ?? '')) ?: null,
                'model' => trim((string)($body['model'] ?? '')) ?: null,
                'color' => trim((string)($body['color'] ?? '')) ?: null,
            ]);
        } catch (PDOException $error) {
            if ((string)$error->getCode() === '23000') {
                respond(409, ['ok' => false, 'error' => ['code' => 'DUPLICATE_VEHICLE', 'message' => 'Esta placa já está cadastrada na sua conta.']]);
            }
            throw $error;
        }
        respond(201, ['ok' => true, 'id' => $id]);
    }

    if (preg_match('#^/api/citizen/vehicles/([0-9a-f-]{36})$#i', $path, $match) && $method === 'DELETE') {
        $session = citizenSession($pdo, $method);
        $delete = $pdo->prepare('DELETE FROM vehicles WHERE id = :id AND owner_id = :owner_id');
        $delete->execute(['id' => $match[1], 'owner_id' => $session['user_id']]);
        if ($delete->rowCount() !== 1) respond(404, ['ok' => false, 'error' => ['code' => 'VEHICLE_NOT_FOUND', 'message' => 'Veículo não encontrado.']]);
        respond(200, ['ok' => true]);
    }

    if ($path === '/api/citizen/sessions' && $method === 'POST') {
        $session = citizenSession($pdo, $method);
        $body = apiJsonBody();
        $vehicleId = (string)($body['vehicle_id'] ?? '');
        $spaceId = trim((string)($body['space_id'] ?? '')) ?: null;
        $category = (string)($body['beneficiary_category'] ?? 'conventional');
        $latitude = filter_var($body['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $longitude = filter_var($body['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
        $accuracy = filter_var($body['accuracy_m'] ?? null, FILTER_VALIDATE_FLOAT);
        if (!in_array($category, ['conventional', 'elderly', 'accessible'], true)
            || $latitude === false || $longitude === false || $latitude < -90 || $latitude > 90
            || $longitude < -180 || $longitude > 180 || $accuracy === false || $accuracy < 0) {
            respond(422, ['ok' => false, 'error' => ['code' => 'INVALID_LOCATION', 'message' => 'Não foi possível validar a localização do dispositivo. Ative o GPS e tente novamente.']]);
        }

        if ($category !== 'conventional' && ($body['credential_confirmed'] ?? false) !== true) {
            respond(422, ['ok' => false, 'error' => ['code' => 'CREDENTIAL_CONFIRMATION_REQUIRED', 'message' => 'Confirme que possui e utiliza credencial válida para a categoria especial.']]);
        }

        $vehicleQuery = $pdo->prepare('SELECT id, plate FROM vehicles WHERE id = :id AND owner_id = :owner_id LIMIT 1');
        $vehicleQuery->execute(['id' => $vehicleId, 'owner_id' => $session['user_id']]);
        $vehicle = $vehicleQuery->fetch();
        if (!$vehicle) respond(404, ['ok' => false, 'error' => ['code' => 'VEHICLE_NOT_FOUND', 'message' => 'Selecione um veículo cadastrado na sua conta.']]);

        if ($spaceId !== null) {
            $spaceQuery = $pdo->prepare('SELECT id, category FROM parking_spaces WHERE id = :id AND active = 1 LIMIT 1');
            $spaceQuery->execute(['id' => $spaceId]);
            $space = $spaceQuery->fetch();
            if (!$space) respond(422, ['ok' => false, 'error' => ['code' => 'SPACE_UNAVAILABLE', 'message' => 'A vaga selecionada não está disponível.']]);
        }

        $minutes = $category === 'conventional' ? 60 : 120;
        $id = citizenUuid();
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $expires = $now->modify('+' . $minutes . ' minutes');
        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE parking_sessions SET status = 'expired' WHERE status = 'active' AND expires_at <= UTC_TIMESTAMP(3)")->execute();
            $pdo->prepare('DELETE FROM active_plate_registry WHERE expires_at <= UTC_TIMESTAMP(3)')->execute();
            $active = $pdo->prepare(
                "SELECT id FROM parking_sessions WHERE status = 'active' AND (vehicle_id = :vehicle_id OR plate_snapshot = :plate OR user_id = :user_id) LIMIT 1 FOR UPDATE"
            );
            $active->execute(['vehicle_id' => $vehicle['id'], 'plate' => $vehicle['plate'], 'user_id' => $session['user_id']]);
            if ($active->fetch()) {
                $pdo->rollBack();
                respond(409, ['ok' => false, 'error' => ['code' => 'ACTIVE_SESSION_EXISTS', 'message' => 'Esta placa já possui um estacionamento em andamento.']]);
            }

            $insert = $pdo->prepare(
                "INSERT INTO parking_sessions
                 (id,user_id,vehicle_id,space_id,plate_snapshot,category,started_at,expires_at,status,latitude,longitude,beneficiary_category,location_accuracy_m,location_captured_at)
                 VALUES (:id,:user_id,:vehicle_id,:space_id,:plate,:category,:started,:expires,'active',:latitude,:longitude,:beneficiary,:accuracy,:captured)"
            );
            $insert->execute([
                'id' => $id, 'user_id' => $session['user_id'], 'vehicle_id' => $vehicle['id'],
                'space_id' => $spaceId, 'plate' => $vehicle['plate'], 'category' => $category,
                'started' => $now->format('Y-m-d H:i:s.v'), 'expires' => $expires->format('Y-m-d H:i:s.v'),
                'latitude' => $latitude, 'longitude' => $longitude, 'beneficiary' => $category,
                'accuracy' => $accuracy, 'captured' => $now->format('Y-m-d H:i:s.v'),
            ]);
            $registry = $pdo->prepare(
                "INSERT INTO active_plate_registry (plate,source_type,source_id,expires_at)
                 VALUES (:plate,'citizen',:source_id,:expires_at)"
            );
            $registry->execute(['plate' => $vehicle['plate'], 'source_id' => $id, 'expires_at' => $expires->format('Y-m-d H:i:s.v')]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($error instanceof PDOException && (string)$error->getCode() === '23000') {
                respond(409, ['ok' => false, 'error' => ['code' => 'ACTIVE_PLATE_CONFLICT', 'message' => 'Esta placa já possui um estacionamento em andamento.']]);
            }
            throw $error;
        }
        respond(201, ['ok' => true, 'id' => $id, 'started_at' => $now->format(DATE_ATOM), 'expires_at' => $expires->format(DATE_ATOM)]);
    }

    if (preg_match('#^/api/citizen/sessions/([0-9a-f-]{36})/finish$#i', $path, $match) && $method === 'POST') {
        $session = citizenSession($pdo, $method);
        $pdo->beginTransaction();
        $update = $pdo->prepare(
            "UPDATE parking_sessions SET status = 'finished', ended_at = UTC_TIMESTAMP(3)
             WHERE id = :id AND user_id = :user_id AND status = 'active'"
        );
        $update->execute(['id' => $match[1], 'user_id' => $session['user_id']]);
        if ($update->rowCount() !== 1) {
            $pdo->rollBack();
            respond(404, ['ok' => false, 'error' => ['code' => 'SESSION_NOT_FOUND', 'message' => 'Estacionamento ativo não encontrado.']]);
        }
        $pdo->prepare("DELETE FROM active_plate_registry WHERE source_type = 'citizen' AND source_id = :id")->execute(['id' => $match[1]]);
        $pdo->commit();
        respond(200, ['ok' => true]);
    }

    if ($path === '/api/citizen/notifications' && $method === 'GET') {
        $session = citizenSession($pdo, $method);
        $rows = citizenRows($pdo,
            'SELECT id,title,body,kind,read_at,created_at FROM notifications
             WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 30',
            ['user_id' => $session['user_id']]
        );
        foreach ($rows as &$notice) {
            $notice['created_at'] = citizenIsoDateTime($notice['created_at']);
            $notice['read_at'] = citizenIsoDateTime($notice['read_at']);
        }
        unset($notice);
        respond(200, ['ok' => true, 'notifications' => $rows]);
    }

    if ($path === '/api/citizen/notifications' && $method === 'POST') {
        $session = citizenSession($pdo, $method);
        $body = apiJsonBody();
        $id = citizenUuid();
        $insert = $pdo->prepare(
            'INSERT INTO notifications (id,user_id,title,body,kind) VALUES (:id,:user_id,:title,:body,:kind)'
        );
        $insert->execute([
            'id' => $id, 'user_id' => $session['user_id'],
            'title' => mb_substr(trim((string)($body['title'] ?? 'Aviso')), 0, 180),
            'body' => trim((string)($body['body'] ?? '')),
            'kind' => mb_substr(trim((string)($body['kind'] ?? 'general')), 0, 60),
        ]);
        respond(201, ['ok' => true, 'id' => $id]);
    }

    if (preg_match('#^/api/citizen/notifications/([0-9a-f-]{36})/read$#i', $path, $match) && $method === 'PATCH') {
        $session = citizenSession($pdo, $method);
        $update = $pdo->prepare('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE id = :id AND user_id = :user_id');
        $update->execute(['id' => $match[1], 'user_id' => $session['user_id']]);
        respond(200, ['ok' => true]);
    }

    if ($path === '/api/citizen/push-subscriptions' && $method === 'POST') {
        $session = citizenSession($pdo, $method);
        $body = apiJsonBody();
        $subscription = $body['subscription'] ?? null;
        $endpoint = is_array($subscription) ? (string)($subscription['endpoint'] ?? '') : '';
        if ($endpoint === '' || strlen($endpoint) > 2048) {
            respond(422, ['ok' => false, 'error' => ['code' => 'INVALID_SUBSCRIPTION', 'message' => 'Inscrição de notificações inválida.']]);
        }
        $id = citizenUuid();
        $statement = $pdo->prepare(
            'INSERT INTO push_subscriptions (id,user_id,endpoint,subscription,endpoint_hash)
             VALUES (:id,:user_id,:endpoint,:subscription,:endpoint_hash)
             ON DUPLICATE KEY UPDATE subscription = VALUES(subscription), updated_at = UTC_TIMESTAMP(3)'
        );
        $statement->execute([
            'id' => $id, 'user_id' => $session['user_id'], 'endpoint' => $endpoint,
            'subscription' => json_encode($subscription, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'endpoint_hash' => hash('sha256', $endpoint),
        ]);
        respond(200, ['ok' => true]);
    }

    return false;
}
