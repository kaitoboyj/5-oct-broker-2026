# Fix Telegram `/pull` account lookup

## Goal
Make `/pull` reliably show every existing created or imported account, including accounts created before the Telegram shortcut was added.

## Confirmed cause
- The bot currently builds its buttons only from `wallet_phrases`.
- Existing usernames and wallet addresses are stored in `wallet_profiles`.
- `wallet_phrases` is populated only during newer wallet login/create/import flows, and failures there are deliberately ignored so login can continue. Older accounts therefore produce “no accounts on file yet.”

## Changes
1. Change the `/pull` account list to read the canonical `wallet_profiles` account registry, ordered and deduplicated, rather than requiring a phrase-backup row.
2. Add clear database-error handling so the bot reports a temporary lookup problem instead of incorrectly saying there are no accounts.
3. Keep the password gate, allowed Telegram group restriction, password-message deletion, and 10-minute per-user unlock.
4. When management selects an account, return safe account details such as username and wallet address. Do not send seed phrases or private keys through Telegram; those credentials give complete control of customer funds and must not be exposed by a bot command.
5. Keep callback payloads within Telegram limits and resolve the selected account by an exact stable identifier, avoiding ambiguous address-prefix matches.
6. Verify the webhook setup remains Netlify-compatible: expected live URL, secret-token verification, required update types, and automatic post-build registration.
7. Add focused checks for existing-account listing, empty results, database errors, unauthorized chats, expired unlocks, and account selection.

## Netlify outcome
The change will remain compatible with GitHub-triggered Netlify deploys. After deployment, `/pull` will list existing accounts from the same registry used by Admin and Mix Man, without requiring each account owner to sign in again.
