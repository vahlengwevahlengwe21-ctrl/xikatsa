USE `xikatsa_society`;

CREATE TABLE IF NOT EXISTS `society_policy` (
  `id` TINYINT UNSIGNED NOT NULL,
  `content` LONGTEXT NOT NULL,
  `updated_by_role` VARCHAR(40) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_society_policy_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `society_policy` (`id`, `content`, `updated_by_role`)
VALUES (1, '', 'super-administrator')
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);

ALTER TABLE `society_policy`
  ADD COLUMN IF NOT EXISTS `document_name` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `document_mime_type` VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS `document_size` INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS `document_data` MEDIUMBLOB NULL;
