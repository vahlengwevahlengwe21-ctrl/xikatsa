USE `xikatsa_society`;

CREATE SEQUENCE IF NOT EXISTS `member_number_seq` START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS `members` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `member_number` VARCHAR(16) NOT NULL,
  `full_name` VARCHAR(200) NOT NULL,
  `email` VARCHAR(254) NULL,
  `phone` VARCHAR(40) NULL,
  `address` VARCHAR(500) NULL,
  `date_joined` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `role` ENUM('super-administrator', 'administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary', 'member') NOT NULL DEFAULT 'member',
  `monthly_contribution` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_members_member_number` (`member_number`),
  CONSTRAINT `chk_members_monthly_contribution` CHECK (`monthly_contribution` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `beneficiaries` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `member_id` CHAR(36) NOT NULL,
  `full_name` VARCHAR(200) NOT NULL,
  `relationship` VARCHAR(100) NOT NULL,
  `date_of_birth` DATE NULL,
  `phone` VARCHAR(40) NULL,
  `share_percent` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_beneficiaries_member_created` (`member_id`, `created_at`),
  CONSTRAINT `chk_beneficiaries_share_percent` CHECK (`share_percent` >= 0 AND `share_percent` <= 100),
  CONSTRAINT `fk_beneficiaries_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `benefit_programs` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `name` VARCHAR(160) NOT NULL,
  `description` TEXT NULL,
  `benefit_amount` DECIMAL(12,2) NOT NULL,
  `frequency` ENUM('one_time', 'monthly', 'quarterly', 'annual') NOT NULL DEFAULT 'one_time',
  `eligibility` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_benefit_programs_active_name` (`is_active`, `name`),
  CONSTRAINT `chk_benefit_programs_amount` CHECK (`benefit_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `benefit_claims` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `member_id` CHAR(36) NOT NULL,
  `beneficiary_id` CHAR(36) NULL,
  `program_id` CHAR(36) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'paid') NOT NULL DEFAULT 'pending',
  `reason` TEXT NULL,
  `decision_note` TEXT NULL,
  `requested_on` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `decided_on` DATE NULL,
  `paid_on` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_benefit_claims_member_requested` (`member_id`, `requested_on`),
  KEY `idx_benefit_claims_program` (`program_id`),
  KEY `idx_benefit_claims_beneficiary` (`beneficiary_id`),
  KEY `idx_benefit_claims_status_requested` (`status`, `requested_on`),
  CONSTRAINT `chk_benefit_claims_amount` CHECK (`amount` > 0),
  CONSTRAINT `fk_benefit_claims_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_benefit_claims_beneficiary` FOREIGN KEY (`beneficiary_id`) REFERENCES `beneficiaries` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_benefit_claims_program` FOREIGN KEY (`program_id`) REFERENCES `benefit_programs` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `kind` ENUM('contribution', 'joining_fee', 'donation', 'other_income', 'expense', 'benefit_payout') NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `description` VARCHAR(500) NOT NULL,
  `category` VARCHAR(120) NULL,
  `reference` VARCHAR(160) NULL,
  `occurred_on` DATE NOT NULL DEFAULT (CURRENT_DATE),
  `member_id` CHAR(36) NULL,
  `claim_id` CHAR(36) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_transactions_member_occurred` (`member_id`, `occurred_on`),
  KEY `idx_transactions_claim` (`claim_id`),
  KEY `idx_transactions_occurred_created` (`occurred_on`, `created_at`),
  UNIQUE KEY `uq_transactions_one_payout_per_claim` (`claim_id`),
  CONSTRAINT `chk_transactions_amount` CHECK (`amount` > 0),
  CONSTRAINT `fk_transactions_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_claim` FOREIGN KEY (`claim_id`) REFERENCES `benefit_claims` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `title` VARCHAR(180) NOT NULL,
  `body` TEXT NOT NULL,
  `severity` ENUM('notice', 'important', 'urgent') NOT NULL DEFAULT 'notice',
  `published_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_on` DATE NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_active_published` (`is_active`, `published_at`),
  KEY `idx_announcements_expiry` (`expires_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;