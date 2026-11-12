USE `xikatsa_society`;

CREATE TABLE IF NOT EXISTS `society_gallery` (
  `id` CHAR(36) NOT NULL,
  `caption` VARCHAR(180) NOT NULL DEFAULT '',
  `mime_type` ENUM('image/jpeg', 'image/png', 'image/webp') NOT NULL,
  `image_size` INT UNSIGNED NOT NULL,
  `image_data` MEDIUMBLOB NOT NULL,
  `published_by_role` ENUM('secretary', 'deputy-secretary') NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_society_gallery_created_at` (`created_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
