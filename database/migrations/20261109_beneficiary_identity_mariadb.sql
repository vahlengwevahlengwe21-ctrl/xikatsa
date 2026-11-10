USE `xikatsa_society`;

ALTER TABLE `beneficiaries`
  ADD COLUMN `first_name` VARCHAR(100) NULL AFTER `full_name`,
  ADD COLUMN `surname` VARCHAR(100) NULL AFTER `first_name`,
  ADD COLUMN `id_number` VARCHAR(32) NULL AFTER `surname`,
  ADD COLUMN `deceased_at` DATE NULL AFTER `is_active`;

UPDATE `beneficiaries`
SET
  `first_name` = SUBSTRING_INDEX(TRIM(`full_name`), ' ', 1),
  `surname` = CASE
    WHEN LOCATE(' ', TRIM(`full_name`)) = 0 THEN TRIM(`full_name`)
    ELSE TRIM(SUBSTRING(TRIM(`full_name`), LOCATE(' ', TRIM(`full_name`)) + 1))
  END
WHERE `first_name` IS NULL OR `surname` IS NULL;

ALTER TABLE `beneficiaries`
  MODIFY COLUMN `first_name` VARCHAR(100) NOT NULL,
  MODIFY COLUMN `surname` VARCHAR(100) NOT NULL,
  ADD UNIQUE KEY `uq_beneficiaries_id_number` (`id_number`);
