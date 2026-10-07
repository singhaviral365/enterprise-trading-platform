"""Builds the two plain-SQL update scripts for pgAdmin from the application's own schema files.

    python databases/PostgreSQL/tools/build_update_scripts.py

Writes databases/PostgreSQL/migrations/update_trading_db.sql (the startup schema scripts and sample_data.sql pasted together, in one
transaction) and update_auth_db.sql. Never edit those two by hand: change the source, then run this. UpdateScriptSyncTest fails the
build when a source changed and the update script was not rebuilt.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
res = os.path.join(root, 'services', 'order-service', 'src', 'main', 'resources')
mig = os.path.join(root, 'databases', 'PostgreSQL', 'migrations')

def rd(path):
    return open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')

def body(path):
    """The file without its own BEGIN;/COMMIT; lines (the update script has one transaction around everything)."""
    s = rd(path)
    s = re.sub(r'^(BEGIN|COMMIT);\n', '', s, flags=re.M)
    return s.strip('\n') + '\n'

def section(title, text):
    bar = '-- ' + '=' * 76
    return '\n%s\n-- %s\n%s\n\n%s' % (bar, title, bar, text)

mig_notif = rd(os.path.join(mig, 'add_notifications_and_price_alerts.sql'))
i = mig_notif.index('-- An earlier draft of this change kept the email')
j = mig_notif.index('$$;', mig_notif.index('DO $$', i)) + 3
carry_over = mig_notif[i:j] + '\n'

header = """-- ============================================================================
-- UPDATE TRADING DATABASE TO LATEST   (run in pgAdmin: open the Query Tool on trading_db, paste, press F5)
-- Plain SQL only. No psql commands, so it works in pgAdmin's Query Tool as it is.
-- ============================================================================
-- Brings ANY existing trading database to the latest schema and sample data, whatever version it is on. Every statement
-- checks first: it skips what is already there and applies what is not, so it is safe to run again and again, and a
-- machine several versions behind ends in the same place as one that is one version behind. It is ONE transaction: if
-- anything fails nothing is changed (in pgAdmin, read the error, fix it, and run the whole script again).
--
-- What it does, in order
--   0. A leftover account.phone_number column (a duplicate of phone_no) is merged into phone_no and dropped.
--   1. The core schema: account (with email and phone_no), instrument (currency, icon), orders, holdings, triggers.
--      A database with no tables at all gets all of it.
--   2. Watchlists and the price-alert columns on watchlist_item.
--   3. Customer preferences.
--   4. Notifications (notification, notification_delivery); an earlier draft's notification_contact is folded into
--      account.email and dropped.
--   5. Portfolio: the realised profit and loss ledger (realised_pnl_entry).
--   6. Portfolio performance: closed-day candles and statements (price_candle_daily, portfolio_nav_daily).
--   7. Automated strategies (strategy, strategy_run), plus the STRATEGY_EXECUTION notification category and its switch on the
--      customer preferences. A database that predates them has the notification category constraint replaced in place.
--   8. Sample data: rows that are missing are inserted, rows that exist are left alone, and the email/phone of sample
--      accounts that predate those columns are filled in (a value that is already there is never overwritten).
--
-- The Auth database is separate: run update_auth_db.sql on auth_db for the matching side (same emails per user_id).
--
-- Sections 1-8 are the application's own start-up scripts (schema.sql, watchlist-schema.sql, preferences-schema.sql,
-- notifications-schema.sql, portfolio-schema.sql, portfolio-performance-schema.sql, strategy-schema.sql) and sample_data.sql, copied in unchanged; UpdateScriptSyncTest fails if they drift.
-- ============================================================================

BEGIN;
"""

phone_step = """DO $$
BEGIN
    IF to_regclass('account') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = current_schema() AND table_name = 'account' AND column_name = 'phone_number') THEN
        -- Keep phone_no, the column the application uses. Copy across only values that are valid phone numbers.
        ALTER TABLE account ADD COLUMN IF NOT EXISTS phone_no VARCHAR(20);
        UPDATE account
        SET phone_no = LEFT(TRIM(phone_number), 20)
        WHERE phone_no IS NULL
          AND phone_number IS NOT NULL
          AND TRIM(phone_number) ~ '^\\+?[0-9[:space:]()-]{10,20}$';
        ALTER TABLE account DROP COLUMN phone_number;
        RAISE NOTICE 'account.phone_number merged into account.phone_no and dropped';
    END IF;
END
$$;
"""

out = header
out += section('0. Duplicate phone_number column', phone_step)
out += section('1. Core schema (schema.sql)', body(os.path.join(res, 'schema.sql')))
out += section('2. Watchlists and price alerts (watchlist-schema.sql)', body(os.path.join(res, 'watchlist-schema.sql')))
out += section('3. Customer preferences (preferences-schema.sql)', body(os.path.join(res, 'preferences-schema.sql')))
out += section('4. Notifications (notifications-schema.sql)', body(os.path.join(res, 'notifications-schema.sql')) + '\n' + carry_over)
out += section('5. Portfolio realised P&L (portfolio-schema.sql)', body(os.path.join(res, 'portfolio-schema.sql')))
out += section('6. Portfolio performance (portfolio-performance-schema.sql)', body(os.path.join(res, 'portfolio-performance-schema.sql')))
out += section('7. Automated strategies (strategy-schema.sql)', body(os.path.join(res, 'strategy-schema.sql')))
out += section('8. Sample data (sample_data.sql)', body(os.path.join(mig, 'sample_data.sql')))
out += '\nCOMMIT;\n'
open(os.path.join(mig, 'update_trading_db.sql'), 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n'))

# user_id, username, email (fixed, written out), the username an older seed used for this id
USERS = [
    (1000, 'alice.trader',    'alice.trader@example.com',    'john.smith'),
    (1001, 'yuvaraj.k',       'yuvaraj.k@example.com',       'olivia.martin'),
    (1002, 'aviral.singh',    'aviral.singh@example.com',    'david.taylor'),
    (1003, 'riya.rajesh',     'riya.rajesh@example.com',     'sophia.anderson'),
    (1004, 'lalitha.prakash', 'lalitha.prakash@example.com', 'james.thomas'),
    (1005, 'vishal.fmri',     'vishal.fmri@example.com',     'liam.harris'),
    (1006, 'aashifa.aalifa',  'aashifa.aalifa@example.com',  'amelia.walker'),
    (1007, 'swetha.fmri',     'swetha.fmri@example.com',     'noah.hall'),
    (1008, 'agneya.fmri',     'agneya.fmri@example.com',     'mia.allen'),
    (1009, 'nanditha.fmri',   'nanditha.fmri@example.com',   'oliver.young'),
]
rows = ',\n'.join("            (%d, '%s', '%s', '$2b$12$clienthash%03d', '%s')" % (uid, name, email, k + 1, old)
                  for k, (uid, name, email, old) in enumerate(USERS))

HEAD = """-- ============================================================================
-- UPDATE AUTH DATABASE TO LATEST   (run in pgAdmin: open the Query Tool on auth_db, paste, press F5)
-- Plain SQL only. No psql commands, so it works in pgAdmin's Query Tool as it is.
-- ============================================================================
-- Brings any existing auth database to the latest layout and the fixed sample users. Safe to run again and again.
--
--   * No users table at all: creates users and refresh_tokens (the current layout, with the numeric user_id).
--   * Users 1000-1009 get the FIXED usernames and emails listed below, written out in full. The trading database's
--     sample accounts carry the same user_id and the very same email (update_trading_db.sql), so a login and its account
--     line up. The two databases cannot enforce that; SeedDataConsistencyTest checks that the files agree.
--       - a user id that is missing is inserted;
--       - a user id that holds this username, or the username an older seed used for it, has its username and email set
--         to the fixed values (its password is left alone);
--       - if the fixed username or email is already taken by a DIFFERENT user_id, that id is skipped with a notice
--         (it would break a unique rule), and you decide what to do with the clash.
--   * The id sequence is moved past the highest id in use, so new registrations never collide with the sample users.
--   * otp_challenges and users.two_factor_enabled (two-step sign-in, forgot password, email-checked registration) are created
--     or brought up to date, the same statements as add_auth_otp_challenges.sql.
--
-- A users table in the old layout (a UUID id column and no user_id) is not migrated: the script stops and says so.
-- Users with other ids are never touched. It does not create the database or the auth_user role (auth_setup.sql does,
-- with psql): run this inside the existing auth_db.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        CREATE TABLE users (
            user_id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (START 1000),
            username VARCHAR(64) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            roles TEXT[] NOT NULL DEFAULT ARRAY['CUSTOMER'],
            created_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_users_roles CHECK (array_length(roles, 1) > 0)
        );
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL UNIQUE,
            issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            CONSTRAINT chk_refresh_tokens_expires CHECK (expires_at > issued_at)
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(revoked_at) WHERE revoked_at IS NULL;
        RAISE NOTICE 'users and refresh_tokens created';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id') THEN
        RAISE EXCEPTION 'users is in the old layout (no user_id column): not migrated. Recreate auth_db with auth_setup.sql.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
"""
TAIL = """
        ) AS s (user_id, username, email, password_hash, old_username)
    LOOP
        INSERT INTO users (user_id, username, email, password_hash, roles, created_on, updated_at)
        VALUES (r.user_id, r.username, r.email, r.password_hash, ARRAY['CUSTOMER'], NOW(), NOW())
        ON CONFLICT DO NOTHING;

        UPDATE users
        SET username = r.username,
            email = r.email,
            updated_at = NOW()
        WHERE user_id = r.user_id
          AND username IN (r.username, r.old_username)
          AND (username <> r.username OR email <> r.email)
          AND NOT EXISTS (SELECT 1 FROM users o
                          WHERE o.user_id <> r.user_id AND (o.username = r.username OR o.email = r.email));

        IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = r.user_id AND username = r.username AND email = r.email) THEN
            RAISE NOTICE 'user_id % was NOT aligned to % / %: it holds a different user, or the username or email belongs to another id',
                r.user_id, r.username, r.email;
        END IF;
    END LOOP;

    -- New registrations continue after the highest id in use.
    PERFORM setval(pg_get_serial_sequence('users', 'user_id'),
                   GREATEST((SELECT COALESCE(MAX(user_id), 0) FROM users) + 1, 1000), false);
END
$$;

-- The sample users as they are now. The same user_ids in trading_db:
--   SELECT user_id, email, phone_no FROM account WHERE user_id BETWEEN 1000 AND 1009 ORDER BY user_id;
SELECT user_id, username, email FROM users WHERE user_id BETWEEN 1000 AND 1009 ORDER BY user_id;
"""
split = TAIL.index('-- The sample users as they are now.')

def otp_body():
    """add_auth_otp_challenges.sql without its own BEGIN/COMMIT: the table the sign-in codes live in, and users.two_factor_enabled."""
    text = rd(os.path.join(mig, 'add_auth_otp_challenges.sql'))
    text = text[text.index('BEGIN;') + len('BEGIN;'):text.rindex('COMMIT;')].strip('\n')
    return text + '\n'

OTP_INTRO = """
-- Two-step sign-in, forgot password and email-checked registration (from add_auth_otp_challenges.sql, which the auth service also
-- applies itself on start-up): the otp_challenges table and users.two_factor_enabled. Needs the users table above.
"""
out = HEAD + rows + TAIL[:split] + OTP_INTRO + otp_body() + '\n' + TAIL[split:]
open(os.path.join(mig, 'update_auth_db.sql'), 'w', encoding='utf-8', newline='').write(out.replace('\n', '\r\n'))
print('auth built')
