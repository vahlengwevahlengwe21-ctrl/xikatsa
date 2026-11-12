USE `xikatsa_society`;

CREATE TABLE IF NOT EXISTS `society_founder_photo` (
  `id` TINYINT UNSIGNED NOT NULL,
  `mime_type` ENUM('image/jpeg', 'image/png', 'image/webp') NOT NULL,
  `image_size` INT UNSIGNED NOT NULL,
  `image_data` MEDIUMBLOB NOT NULL,
  `updated_by_role` ENUM('secretary', 'deputy-secretary') NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_society_founder_photo_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
