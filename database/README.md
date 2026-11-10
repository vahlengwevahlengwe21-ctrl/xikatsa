# Database setup

Apply these MariaDB migrations in order:

1. `migrations/20261109_initial_xikatsa_mariadb.sql`
2. `migrations/20261109_society_features_mariadb.sql`
3. `migrations/20261109_auth_settings_mariadb.sql`
4. `migrations/20261109_member_identity_mariadb.sql`
5. `migrations/20261109_beneficiary_identity_mariadb.sql`
6. `migrations/20261109_society_policy_mariadb.sql`
7. `migrations/20261109_financial_controls_mariadb.sql`
8. `migrations/20261109_user_contact_number_mariadb.sql`
9. `migrations/20261110_fine_transactions_mariadb.sql`
10. `migrations/20261110_retire_administrator_role_mariadb.sql`
11. `migrations/20261110_committee_membership_mariadb.sql`
12. `migrations/20261110_separate_dependants_death_beneficiaries_mariadb.sql`

Configure `DATABASE_GATEWAY_URL` and `DATABASE_GATEWAY_TOKEN` in the server environment. The application does not seed demo users and has no public registration flow. Create the first super-administrator directly in MariaDB:

1. Run `node database/hash-password.mjs` in an interactive terminal. Enter a unique password of at least 12 characters; the utility does not echo it and prints a scrypt hash.
2. In one MariaDB session, execute the following statements with your administrator's name, contact number, unique 13-digit numeric ID number, and generated hash:

```sql
SET @initial_admin_id = UUID();

INSERT INTO users (id, full_name, contact_number, login_id, password_hash)
VALUES (@initial_admin_id, 'Administrator name', 'REPLACE_WITH_CONTACT_NUMBER', 'REPLACE_WITH_13_DIGIT_ID', 'PASTE_SCRYPT_HASH_HERE');

INSERT INTO user_roles (user_id, role_id)
SELECT @initial_admin_id, id
FROM roles
WHERE role_key = 'super-administrator';
```

The isolated database gateway allows only SQL statements listed in its source tree. `gateway-queries.ts` is the application's SQL allowlist catalogue; when application SQL changes, synchronize it to the gateway's `src` tree and restart `aio-xikatsa-db-gateway.service`. Keep statements parameterized and explicitly allowlisted; never enable arbitrary SQL execution.

The Super Administrator is reserved for the system creator and has full application access, including staff account and role management; it is never offered for staff or member assignment in the app. Operational roles are Chairperson and Deputy Chairperson (member governance, claim decisions, benefit programs, and policy/announcement oversight), Finance and Deputy Finance (money records, fines, payouts, and reconciliation), and Secretary and Deputy Secretary (announcements and policy amendments). Staff can review operational records according to their area; members are limited to their own member services, claims, announcements, and policy. The Administrator role has been retired: the migration preserves existing Administrator accounts and reassigns them to Chairperson, removes the role from staff assignment, and preserves historical transaction and announcement records.

Every account, including all staff roles and main members, signs in with its unique 13-digit numeric ID number and password. New staff accounts require a contact number; email is no longer collected by the account form. Each committee account is linked to an active main-member record starting on the account creation date, with the current default monthly contribution. The committee member participates under the same contribution, dependant, waiting-period, policy, and benefit rules as every other main member; the staff role only adds its operational permissions. The committee-membership migration converts existing committee accounts using today's date and current default contribution, without creating backdated dues. At the annual committee review, the Super Administrator can retain an office-holder's role, assign another office to an existing account, or change a departing office-holder to the Member role. Member-role accounts are not shown on the committee roster; they reappear only if assigned a committee role again. Staff can open their own membership record to manage dependants and submit benefit claims while retaining their role access to group operations. After signing in, the Super Administrator can create and manage staff accounts and roles from Settings; the Super Administrator account and role are intentionally excluded from those lists and cannot be changed there. There is no self-service password recovery or SMS reset flow: a Super Administrator must set a new password for another staff account in Settings. If the Super Administrator password is forgotten, an authorized database operator must recover access. User passwords are stored as scrypt hashes; sessions use random opaque tokens whose hashes are stored in the database. Society settings are persisted in `society_settings`; saving settings updates the monthly contribution for all existing members, while the waiting-period setting qualifies main members and the joining-fee setting prefills new joining-fee financial entries.

To recover a staff account, a super-administrator edits that account in Settings, enters a new password and matching confirmation, then saves. For a forgotten super-administrator password, an authorized database operator can run `node database/hash-password.mjs` in an interactive terminal and use the generated hash in the following MariaDB statements, replacing the login ID and hash. These statements also revoke existing sessions:

```sql
UPDATE users
SET password_hash = 'PASTE_SCRYPT_HASH_HERE',
    failed_login_attempts = 0,
    locked_until = NULL
WHERE login_id = 'REPLACE_WITH_13_DIGIT_ID'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = users.id AND r.role_key = 'super-administrator'
  );

DELETE s FROM user_sessions s
JOIN users u ON u.id = s.user_id
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.login_id = 'REPLACE_WITH_13_DIGIT_ID'
  AND r.role_key = 'super-administrator';
```

The user contact-number migration makes the existing email column nullable and adds `users.contact_number`. Existing account emails are preserved, and their contact number remains blank until updated in Settings.

The Society Policy page is readable by all signed-in roles. Super Administrator, Chairperson, Deputy Chairperson, Secretary, and Deputy Secretary roles may upload or amend the shared PDF or DOCX policy document (up to 8 MB); all other signed-in roles can download it. Policy changes record the amending role and timestamp in `society_policy`. Synchronize the policy SQL statements from `gateway-queries.ts` to the database gateway and restart the gateway service when deploying this feature.

The Settings page includes the six-role committee membership roster. Users with governance permissions may record a committee member as deceased; this marks the linked membership inactive, records the current date, disables sign-in, and revokes sessions without deleting financial, dependant, or claim history. The deceased account and its role assignment remain for audit history; the system owner can create a replacement account for the vacant role. Do not reactivate or edit a deceased account. Apply the committee-membership migration before using this roster, then synchronize its SQL statements from `gateway-queries.ts` and restart the database gateway.

The Finance page supports genuine backdated transactions: always use the date the payment or expense actually occurred. Record each fine under the distinct `Fine payment` type and link it to the member who paid; the monthly cash-flow summary and ledger show fines separately from contributions and other receipts. Apply `migrations/20261110_fine_transactions_mariadb.sql` before deploying this fine-payment type. The year-end function shortcut records each party payment as a society-level expense under the `Year-end function` category; enter each disbursement separately and retain its receipt or payment reference when available. These entries are included in expenses and deducted from the society's monthly closing balance, without counting as member contributions or benefit claims. Set the society's opening balance at the start of the chosen cutover month to the verified cash/bank balance at that date; transaction records before the cutover month remain available for history but do not get counted again in post-cutover balances.

Apply the finance-controls migration before deploying these features. Synchronize its SQL statements from `gateway-queries.ts` into the database gateway's source tree and restart `aio-xikatsa-db-gateway.service`.

New member registrations require first name, surname, contact number, a 13-digit numeric ID number, password, and matching password confirmation. An alternative contact number is optional. They create a linked member-role account that signs in with that ID number. ID numbers are unique across all accounts. Only the Chairperson and Deputy Chairperson can add or edit members. Staff roles are managed on user accounts, not on member records.

Existing related-person records are migrated to covered dependants, preserving their IDs and historical claims. Each main member may cover up to six active dependants; each dependant must complete a fixed six-month waiting period after registration, in addition to the main member qualifying under the configured membership waiting period. Death beneficiaries are a separate nomination list and have no individual waiting period: claims may be submitted for them only after the main member has completed the membership waiting period and has been recorded deceased. Beneficiary and dependant ID numbers are identity records only, not login credentials. Main members can add records to both lists; authorized staff can edit existing records, while only the Super Administrator, Chairperson, and Deputy Chairperson can remove records. Removal keeps the historical record and past claims. Governance roles can record a member deceased to disable sign-in while preserving history. They can also permanently delete a member; this removes the linked account, covered dependants, beneficiaries, and claims, while financial transactions remain in the ledger without a member link.

The separation migration also removes the former food-allowance rate table. Apply it after the existing committee migration, synchronize all updated SQL statements from `gateway-queries.ts` into the database gateway's source tree, and restart `aio-xikatsa-db-gateway.service` before deploying.
