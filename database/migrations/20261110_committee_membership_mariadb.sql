USE `xikatsa_society`;

ALTER TABLE `members`
  ADD COLUMN IF NOT EXISTS `deceased_at` DATE NULL AFTER `status`;

UPDATE `members` AS m
JOIN `users` AS u ON u.`login_id` = m.`id_number`
JOIN `user_roles` AS ur ON ur.`user_id` = u.`id`
JOIN `roles` AS r ON r.`id` = ur.`role_id`
JOIN `society_settings` AS settings ON settings.`setting_key` = 'defaultMonthlyContribution'
LEFT JOIN `users` AS linked ON linked.`member_id` = m.`id` AND linked.`id` <> u.`id`
SET m.`full_name` = u.`full_name`,
    m.`first_name` = SUBSTRING_INDEX(TRIM(u.`full_name`), ' ', 1),
    m.`surname` = CASE
      WHEN LOCATE(' ', TRIM(u.`full_name`)) = 0 THEN TRIM(u.`full_name`)
      ELSE TRIM(SUBSTRING(TRIM(u.`full_name`), LOCATE(' ', TRIM(u.`full_name`)) + 1))
    END,
    m.`phone` = u.`contact_number`,
    m.`date_joined` = CURRENT_DATE,
    m.`status` = 'active',
    m.`deceased_at` = NULL,
    m.`monthly_contribution` = settings.`setting_value`
WHERE u.`member_id` IS NULL
  AND linked.`id` IS NULL
  AND r.`role_key` IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary');

UPDATE `users` AS u
JOIN `user_roles` AS ur ON ur.`user_id` = u.`id`
JOIN `roles` AS r ON r.`id` = ur.`role_id`
JOIN `members` AS m ON m.`id_number` = u.`login_id`
LEFT JOIN `users` AS linked ON linked.`member_id` = m.`id` AND linked.`id` <> u.`id`
SET u.`member_id` = m.`id`
WHERE u.`member_id` IS NULL
  AND linked.`id` IS NULL
  AND r.`role_key` IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary');

INSERT INTO `members` (
  `id`, `member_number`, `full_name`, `first_name`, `surname`, `id_number`, `email`, `phone`,
  `alternate_phone`, `address`, `date_joined`, `status`, `monthly_contribution`, `notes`
)
SELECT
  UUID(),
  CONCAT('XS-', LPAD(NEXT VALUE FOR `member_number_seq`, 4, '0')),
  u.`full_name`,
  SUBSTRING_INDEX(TRIM(u.`full_name`), ' ', 1),
  CASE
    WHEN LOCATE(' ', TRIM(u.`full_name`)) = 0 THEN TRIM(u.`full_name`)
    ELSE TRIM(SUBSTRING(TRIM(u.`full_name`), LOCATE(' ', TRIM(u.`full_name`)) + 1))
  END,
  u.`login_id`,
  NULL,
  u.`contact_number`,
  NULL,
  NULL,
  CURRENT_DATE,
  'active',
  settings.`setting_value`,
  NULL
FROM `users` AS u
JOIN `user_roles` AS ur ON ur.`user_id` = u.`id`
JOIN `roles` AS r ON r.`id` = ur.`role_id`
JOIN `society_settings` AS settings ON settings.`setting_key` = 'defaultMonthlyContribution'
WHERE u.`member_id` IS NULL
  AND r.`role_key` IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
  AND NOT EXISTS (SELECT 1 FROM `members` AS existing WHERE existing.`id_number` = u.`login_id`);

UPDATE `users` AS u
JOIN `members` AS m ON m.`id_number` = u.`login_id`
JOIN `user_roles` AS ur ON ur.`user_id` = u.`id`
JOIN `roles` AS r ON r.`id` = ur.`role_id`
LEFT JOIN `users` AS linked ON linked.`member_id` = m.`id` AND linked.`id` <> u.`id`
SET u.`member_id` = m.`id`
WHERE u.`member_id` IS NULL
  AND linked.`id` IS NULL
  AND r.`role_key` IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary');

SELECT r.`role_key`, COUNT(u.`id`) AS `unresolved_count`
FROM `roles` AS r
LEFT JOIN `user_roles` AS ur ON ur.`role_id` = r.`id`
LEFT JOIN `users` AS u ON u.`id` = ur.`user_id`
WHERE r.`role_key` IN ('chairperson', 'deputy-chairperson', 'finance', 'deputy-finance', 'secretary', 'deputy-secretary')
  AND (u.`id` IS NULL OR u.`member_id` IS NULL)
GROUP BY r.`role_key`;
