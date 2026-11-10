USE `xikatsa_society`;

ALTER TABLE `benefit_claims`
  DROP FOREIGN KEY `fk_benefit_claims_beneficiary`;

RENAME TABLE `beneficiaries` TO `dependants`;

ALTER TABLE `dependants`
  DROP FOREIGN KEY `fk_beneficiaries_member`,
  ADD CONSTRAINT `fk_dependants_member`
    FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE;

ALTER TABLE `benefit_claims`
  CHANGE COLUMN `beneficiary_id` `dependant_id` CHAR(36) NULL,
  DROP INDEX `idx_benefit_claims_beneficiary`,
  ADD KEY `idx_benefit_claims_dependant` (`dependant_id`),
  ADD CONSTRAINT `fk_benefit_claims_dependant`
    FOREIGN KEY (`dependant_id`) REFERENCES `dependants` (`id`) ON DELETE SET NULL,
  ADD COLUMN `death_beneficiary_id` CHAR(36) NULL AFTER `dependant_id`,
  ADD KEY `idx_benefit_claims_death_beneficiary` (`death_beneficiary_id`);

CREATE TABLE `beneficiaries` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `member_id` CHAR(36) NOT NULL,
  `full_name` VARCHAR(200) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `surname` VARCHAR(100) NOT NULL,
  `id_number` VARCHAR(32) NULL,
  `relationship` VARCHAR(100) NOT NULL,
  `date_of_birth` DATE NULL,
  `phone` VARCHAR(40) NULL,
  `share_percent` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `deceased_at` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_beneficiaries_member_created` (`member_id`, `created_at`),
  UNIQUE KEY `uq_beneficiaries_id_number` (`id_number`),
  CONSTRAINT `chk_beneficiaries_share_percent` CHECK (`share_percent` >= 0 AND `share_percent` <= 100),
  CONSTRAINT `fk_beneficiaries_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `benefit_claims`
  ADD CONSTRAINT `fk_benefit_claims_death_beneficiary`
    FOREIGN KEY (`death_beneficiary_id`) REFERENCES `beneficiaries` (`id`) ON DELETE SET NULL;

DROP TABLE IF EXISTS `society_food_allowance_rates`;
