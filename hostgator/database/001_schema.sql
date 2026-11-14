-- VagaFácil | HostGator MySQL/MariaDB schema
-- Target: MySQL 5.7.44+
-- All timestamps are UTC. Application timezone for rules: America/Sao_Paulo.
-- This file creates structure only; it does not import or delete production data.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NULL,
  email_verified_at DATETIME(3) NULL,
  status ENUM('active','disabled','pending') NOT NULL DEFAULT 'pending',
  password_reset_required TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_app_users_email (email),
  KEY idx_app_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  cpf VARCHAR(14) NULL,
  phone VARCHAR(20) NULL,
  role ENUM('admin','supervisor','agent','citizen') NOT NULL DEFAULT 'citizen',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_profiles_cpf (cpf),
  KEY idx_profiles_role_active (role,is_active,deleted_at),
  CONSTRAINT fk_profiles_user FOREIGN KEY (id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  csrf_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_auth_sessions_token (token_hash),
  KEY idx_auth_sessions_user_expiry (user_id,expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_password_reset_token (token_hash),
  KEY idx_password_reset_user (user_id,expires_at),
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfa_factors (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  factor_name VARCHAR(80) NOT NULL DEFAULT 'VagaFácil',
  secret_ciphertext TEXT NOT NULL,
  encryption_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  verified_at DATETIME(3) NULL,
  last_used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_mfa_factors_user (user_id,verified_at),
  CONSTRAINT fk_mfa_factors_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  factor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mfa_recovery_code (code_hash),
  CONSTRAINT fk_mfa_recovery_factor FOREIGN KEY (factor_id) REFERENCES mfa_factors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plate VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  make VARCHAR(80) NULL,
  model VARCHAR(80) NULL,
  color VARCHAR(50) NULL,
  vehicle_type VARCHAR(50) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_vehicles_owner_plate (owner_id,plate),
  KEY idx_vehicles_plate (plate),
  CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_zones (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  boundary JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_parking_zones_active (active,name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_spaces (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  zone_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code VARCHAR(40) NOT NULL,
  category ENUM('conventional','elderly','accessible') NOT NULL DEFAULT 'conventional',
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  rules JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_parking_spaces_code (code),
  KEY idx_parking_spaces_zone_active (zone_id,active),
  CONSTRAINT fk_parking_spaces_zone FOREIGN KEY (zone_id) REFERENCES parking_zones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_rules (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  weekdays JSON NOT NULL,
  start_time TIME NOT NULL DEFAULT '09:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  saturday_start TIME NULL DEFAULT '09:00:00',
  saturday_end TIME NULL DEFAULT '13:00:00',
  conventional_minutes INT UNSIGNED NOT NULL DEFAULT 60,
  special_minutes INT UNSIGNED NOT NULL DEFAULT 120,
  grace_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_parking_rules_effective (enabled,effective_from,created_at),
  CONSTRAINT fk_parking_rules_creator FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS holidays (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name VARCHAR(160) NOT NULL,
  scope ENUM('national','state','municipal') NOT NULL,
  free_parking TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_holidays_date (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parking_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  vehicle_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  plate_snapshot VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category ENUM('conventional','elderly','accessible') NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  status ENUM('active','expired','finished','cancelled') NOT NULL DEFAULT 'active',
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  beneficiary_category ENUM('conventional','elderly','accessible') NOT NULL DEFAULT 'conventional',
  location_accuracy_m DOUBLE NULL,
  location_captured_at DATETIME(3) NULL,
  active_plate VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN plate_snapshot ELSE NULL END) STORED,
  active_vehicle_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN vehicle_id ELSE NULL END) STORED,
  active_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN user_id ELSE NULL END) STORED,
  active_space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN space_id ELSE NULL END) STORED,
  UNIQUE KEY uq_parking_active_plate (active_plate),
  UNIQUE KEY uq_parking_active_vehicle (active_vehicle_id),
  UNIQUE KEY uq_parking_active_user (active_user_id),
  UNIQUE KEY uq_parking_active_space (active_space_id),
  KEY idx_parking_sessions_expiry (status,expires_at),
  KEY idx_parking_sessions_user_started (user_id,started_at),
  KEY idx_parking_sessions_vehicle (vehicle_id,started_at),
  CONSTRAINT fk_parking_sessions_user FOREIGN KEY (user_id) REFERENCES profiles(id),
  CONSTRAINT fk_parking_sessions_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_parking_sessions_space FOREIGN KEY (space_id) REFERENCES parking_spaces(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alerts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('open','claimed','resolved','dismissed') NOT NULL DEFAULT 'open',
  severity ENUM('attention','expired','enforcement') NOT NULL,
  claimed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  claimed_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_alert_session_severity (session_id,severity),
  KEY idx_alerts_status_created (status,created_at),
  CONSTRAINT fk_alerts_session FOREIGN KEY (session_id) REFERENCES parking_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_claimed_by FOREIGN KEY (claimed_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enforcements (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  alert_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  agent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('in_progress','regular','irregular','closed') NOT NULL DEFAULT 'in_progress',
  result TEXT NULL,
  notes TEXT NULL,
  verified_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_enforcements_alert (alert_id),
  KEY idx_enforcements_agent_created (agent_id,created_at),
  CONSTRAINT fk_enforcements_alert FOREIGN KEY (alert_id) REFERENCES alerts(id),
  CONSTRAINT fk_enforcements_agent FOREIGN KEY (agent_id) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enforcement_photos (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  enforcement_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_enforcement_photos_enforcement (enforcement_id),
  CONSTRAINT fk_enforcement_photos_enforcement FOREIGN KEY (enforcement_id) REFERENCES enforcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  kind VARCHAR(60) NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_notifications_user_created (user_id,created_at),
  KEY idx_notifications_unread (user_id,read_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_logs_created (created_at),
  KEY idx_audit_logs_actor_created (actor_id,created_at),
  KEY idx_audit_logs_entity (entity_type,entity_id),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ads (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  title VARCHAR(180) NOT NULL DEFAULT '',
  alt_text VARCHAR(255) NOT NULL,
  image_path VARCHAR(500) NOT NULL,
  link_url VARCHAR(2048) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  duration_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  KEY idx_ads_active_order (active,sort_order,created_at),
  CONSTRAINT fk_ads_creator FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  endpoint VARCHAR(2048) NOT NULL,
  subscription JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  endpoint_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  UNIQUE KEY uq_push_user_endpoint_hash (user_id,endpoint_hash),
  KEY idx_push_subscriptions_user (user_id),
  CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS physical_card_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  plate_snapshot VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category ENUM('conventional','elderly','accessible') NOT NULL DEFAULT 'conventional',
  zone_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  started_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  status ENUM('active','expired','finished') NOT NULL DEFAULT 'active',
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  location_accuracy_m DOUBLE NULL,
  location_captured_at DATETIME(3) NULL,
  created_by_name VARCHAR(120) NOT NULL,
  ended_at DATETIME(3) NULL,
  active_plate VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN plate_snapshot ELSE NULL END) STORED,
  active_space_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN status='active' THEN space_id ELSE NULL END) STORED,
  UNIQUE KEY uq_physical_active_plate (active_plate),
  UNIQUE KEY uq_physical_active_space (active_space_id),
  KEY idx_physical_started (started_at),
  KEY idx_physical_creator_created (created_by,created_at),
  CONSTRAINT fk_physical_zone FOREIGN KEY (zone_id) REFERENCES parking_zones(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_space FOREIGN KEY (space_id) REFERENCES parking_spaces(id) ON DELETE SET NULL,
  CONSTRAINT fk_physical_creator FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cross-table reservation prevents an active citizen parking and a physical-card
-- registration from simultaneously using the same normalized plate.
CREATE TABLE IF NOT EXISTS active_plate_registry (
  plate VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  source_type ENUM('citizen','physical_card') NOT NULL,
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_active_plate_source (source_type,source_id),
  KEY idx_active_plate_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  identifier_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  succeeded TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_login_attempts_identifier_time (identifier_hash,attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time operational queue for SMTP delivery (password reset / account notices).
CREATE TABLE IF NOT EXISTS mail_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recipient VARCHAR(254) NOT NULL,
  subject VARCHAR(190) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  KEY idx_mail_outbox_status_created (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
