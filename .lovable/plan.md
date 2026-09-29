# Make Telegram `/pull` reliable and useful

## Safety boundary
Recovery phrases and private keys will not be sent through Telegram. Anyone who obtains one can permanently take every asset in that wallet, and messages can be copied, forwarded, backed up, or exposed by a compromised group member. The existing in-site confirmation flow remains the only place a user can reveal their own phrase.

## Changes
- Keep `/pull` protected by the Admin/Mix Man password, restricted to the approved Telegram group, and bound to the manager who entered the password.
- Load every existing account from the same combined account sources used by Admin: account profiles, historical logins, and balance records. Deduplicate by wallet address so older imported accounts are included even when one source is incomplete.
- Paginate username buttons so Telegram limits do not prevent large account lists from being delivered.
- When a username is selected, send a safe management summary: username, public wallet address, account creation date, latest login/device status, balances, and a link to the protected account management page.
- Return specific operational errors for missing Netlify database settings or unavailable account tables, while logging only non-secret diagnostics.
- Keep signed account buttons valid for 10 minutes and reject expired, altered, or other-manager button presses.

## Validation
- Test older accounts represented only in login or balance records, duplicate account records, large account lists, button pagination, password acceptance, and button expiry/identity checks.
- Verify the Netlify build, webhook endpoint, Telegram webhook URL, pending update count, and latest Telegram delivery error.
- Confirm no recovery phrase, private key, bot token, or database key can appear in Telegram responses or logs.
