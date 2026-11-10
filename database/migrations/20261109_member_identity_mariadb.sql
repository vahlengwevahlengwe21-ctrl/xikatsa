USE `xikatsa_society`;

ALTER TABLE `members`
  ADD COLUMN `first_name` VARCHAR(100) NULL AFTER `full_name`,
  ADD COLUMN `surname` VARCHAR(100) NULL AFTER `first_name`,
  ADD COLUMN `id_number` VARCHAR(32) NULL AFTER `surname`,
  ADD COLUMN `alternate_phone` VARCHAR(40) NULL AFTER `phone`,
  ADD UNIQUE KEY `uq_members_id_number` (`id_number`);

UPDATE `members`
SET
  `first_name` = SUBSTRING_INDEX(TRIM(`full_name`), ' ', 1),
  `surname` = CASE
    WHEN LOCATE(' ', TRIM(`full_name`)) = 0 THEN TRIM(`full_name`)
    ELSE TRIM(SUBSTRING(TRIM(`full_name`), LOCATE(' ', TRIM(`full_name`)) + 1))
  END
WHERE `first_name` IS NULL OR `surname` IS NULL;

ALTER TABLE `members`
  MODIFY COLUMN `first_name` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `surname` VARCHAR(100) NOT NULL;

ALTER TABLE `users`
  MODIFY COLUMN `email` VARCHAR(254) NULL,
  ADD COLUMN `login_id` VARCHAR(32) NULL AFTER `email`,
  ADD COLUMN `member_id` CHAR(36) NULL AFTER `login_id`,
  ADD UNIQUE KEY `uq_users_login_id` (`login_id`),
  ADD UNIQUE KEY `uq_users_member_id` (`member_id`),
  ADD CONSTRAINT `fk_users_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE;
