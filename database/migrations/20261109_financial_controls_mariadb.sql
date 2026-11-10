USE `xikatsa_society`;

CREATE TABLE IF NOT EXISTS `society_finance_opening_balance` (
  `id` TINYINT UNSIGNED NOT NULL,
  `opening_balance` DECIMAL(12,2) NOT NULL,
  `effective_month` DATE NOT NULL,
  `updated_by_role` VARCHAR(40) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_society_finance_opening_balance_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `society_food_allowance_rates` (
  `effective_month` DATE NOT NULL,
  `amount_per_member` DECIMAL(12,2) NOT NULL,
  `updated_by_role` VARCHAR(40) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`effective_month`),
  CONSTRAINT `chk_society_food_allowance_nonnegative` CHECK (`amount_per_member` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `society_food_allowance_rates`
  (`effective_month`, `amount_per_member`, `updated_by_role`)
VALUES
  (DATE_SUB(CURRENT_DATE, INTERVAL DAYOFMONTH(CURRENT_DATE) - 1 DAY), 30.00, 'super-administrator');
