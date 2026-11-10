USE `xikatsa_society`;

ALTER TABLE `transactions`
  MODIFY COLUMN `kind` ENUM('contribution', 'joining_fee', 'donation', 'other_income', 'expense', 'benefit_payout') NOT NULL;

ALTER TABLE `members`
  ADD COLUMN IF NOT EXISTS `role` ENUM('super-administrator', 'administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary', 'member') NOT NULL DEFAULT 'member' AFTER `status`;

ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `recorded_by_role` ENUM('super-administrator', 'administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary', 'member') NOT NULL DEFAULT 'member' AFTER `claim_id`;

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` CHAR(36) NOT NULL DEFAULT (UUID()),
  `title` VARCHAR(180) NOT NULL,
  `body` TEXT NOT NULL,
  `severity` ENUM('notice', 'important', 'urgent') NOT NULL DEFAULT 'notice',
  `published_by_role` ENUM('super-administrator', 'administrator', 'chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary', 'member') NOT NULL DEFAULT 'member',
  `published_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_on` DATE NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_active_published` (`is_active`, `published_at`),
  KEY `idx_announcements_expiry` (`expires_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
