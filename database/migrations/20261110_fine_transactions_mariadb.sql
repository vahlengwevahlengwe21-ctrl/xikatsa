USE `xikatsa_society`;

ALTER TABLE `transactions`
  MODIFY COLUMN `kind` ENUM(
    'contribution',
    'joining_fee',
    'donation',
    'fine',
    'other_income',
    'expense',
    'benefit_payout'
  ) NOT NULL;
