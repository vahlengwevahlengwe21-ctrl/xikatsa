USE `xikatsa_society`;

UPDATE `user_roles` AS ur
JOIN `roles` AS old_role ON old_role.`id` = ur.`role_id` AND old_role.`role_key` = 'administrator'
JOIN `roles` AS chairperson ON chairperson.`role_key` = 'chairperson'
SET ur.`role_id` = chairperson.`id`;

DELETE FROM `roles` WHERE `role_key` = 'administrator';
