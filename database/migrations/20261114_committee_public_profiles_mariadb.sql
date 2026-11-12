USE `xikatsa_society`;

CREATE TABLE IF NOT EXISTS `society_committee_profiles` (
  `role_key` ENUM(
    'chairperson',
    'deputy-chairperson',
    'finance',
    'deputy-finance',
    'secretary',
    'deputy-secretary'
  ) NOT NULL,
  `bio` VARCHAR(280) NOT NULL DEFAULT '',
  `mime_type` ENUM('image/jpeg', 'image/png', 'image/webp') NULL,
  `image_size` INT UNSIGNED NULL,
  `image_data` MEDIUMBLOB NULL,
  `updated_by_role` ENUM('super-administrator', 'secretary', 'deputy-secretary') NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
