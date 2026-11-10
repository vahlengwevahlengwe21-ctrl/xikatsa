USE `xikatsa_society`;

ALTER TABLE `users`
  MODIFY COLUMN `email` VARCHAR(254) NULL,
  ADD COLUMN IF NOT EXISTS `contact_number` VARCHAR(40) NULL AFTER `full_name`;
