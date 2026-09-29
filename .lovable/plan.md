# Fix Telegram `/pull` account lookup

## Changes
- Remove the database-backed temporary unlock step that currently makes `/pull` fail when its setup table is missing.
- Put a signed, 10-minute authorization token into each Telegram account button so only the person who entered the password can use it.
- Continue loading existing accounts from the main account registry, with clear handling for missing deployment database settings.
- Keep the command restricted to the configured management group and delete password replies from chat.
- Keep recovery phrases and private keys out of Telegram; selected accounts show their username and wallet address only.

## Validation
- Test password acceptance, signed button creation and verification, expired/wrong-user button rejection, account-list error handling, and the Netlify build status.
- Confirm the webhook remains configured for the deployed Netlify endpoint.

## Deployment requirement
- Netlify must provide the server database URL and private server key. The code will recognize common Netlify variable aliases and report exactly which setting is missing if configuration is incomplete.
