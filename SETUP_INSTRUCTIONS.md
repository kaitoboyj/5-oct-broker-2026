# Setup Instructions for Prime Capital Exchange

## ✅ Changes Made

### 1. Fixed Red Support Button on Mix Man Page

**Problem**: The red "Contact Support" button in the withdraw dialog was redirecting to `/wallet` instead of opening the support chat popup.

**Solution**: Changed the button from a Link to a button element that dispatches the `prime:open-support` event to properly open the floating support chat.

**Files Modified**:
- `src/routes/withdraw.tsx`:
  - Added `MessageCircle` icon import
  - Changed the support stage to show user's message (or default text)
  - Replaced Link with button that opens support chat and closes the withdraw dialog

**How it works now**:
1. Admin sets red support button active on Mix Man page
2. User goes to withdraw page and clicks withdraw
3. System shows fee requirement with red "Support" button
4. Clicking Support shows the message box with "Contact Support" button
5. Clicking "Contact Support" opens the floating support chat popup (bottom-right)
6. User can now directly message support through the chat

---

## 📦 Supabase Database Setup

### Required Tables

Run the complete SQL script located at: **`FULL_SUPABASE_SETUP.sql`**

This creates all necessary tables:

1. **`wallet_profiles`** - User accounts (wallet address, username, phone, email)
2. **`wallet_logins`** - Login history tracking
3. **`wallet_balance_overrides`** - Admin display settings & yield management
4. **`wallet_devices`** - Signed-in devices tracking
5. **`support_threads`** - Support chat threads per user
6. **`support_messages`** - Individual messages within threads
7. **`support_settings`** - Global support chat configuration

### How to Run the SQL

1. Go to your Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New query**
4. Open `FULL_SUPABASE_SETUP.sql` and copy all contents
5. Paste into the query editor
6. Click **Run**

✅ **Safe to run multiple times** - All statements are idempotent (won't break if run again)

---

## 🚀 Netlify Deployment Setup

### Environment Variables Required

Set these in your Netlify dashboard under **Site settings → Environment variables**:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=your-admin-password
THIRDWEB_CLIENT_ID=your-thirdweb-client-id
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
```

### Where to Find Supabase Keys

1. Go to your Supabase Dashboard
2. Click **Settings** → **API**
3. Copy:
   - **Project URL** → use for `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - **anon/public key** → use for `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** → use for `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this secret!

### Build Configuration

The `netlify.toml` is already configured with:
- ✅ Build command: `npm run build && node scripts/register-telegram-webhook.mjs`
- ✅ Publish directory: `dist`
- ✅ Node version: 22
- ✅ Nitro Netlify preset enabled
- ✅ Security headers configured

---

## 🎯 Testing the Support Button

1. Deploy to Netlify
2. Login to admin panel at `/mixman` (use ADMIN_PASSWORD)
3. Go to **Treasury & chat** tab
4. Set withdraw button to **Red (Support)** with a fee amount (e.g., $50)
5. As a regular user, go to home page
6. Click the red withdraw button (should appear at bottom of yield section)
7. Go through withdraw flow - you'll see the fee requirement
8. Click the red "Support" button
9. Click "Contact Support" 
10. ✅ Support chat should open in bottom-right corner

---

## 📝 Additional Notes

### API Keys in Code
The following API keys are configured in `src/lib/api-keys.ts` and don't need Netlify environment variables:
- Alchemy keys
- Covalent keys
- QuickNode keys

### Support Chat Visibility
The support chat bubble becomes visible when:
- User's total wallet activity > $0 (tracked in localStorage)
- OR admin sets chat mode to "always show" for specific user
- Chat mode can be set per-user in Mix Man admin panel

### Telegram Notifications
Configure your Telegram bot token to receive admin notifications when users send support messages.

---

## 🔧 Troubleshooting

**Support button doesn't show**: Check that:
1. Red button is active in Mix Man admin panel
2. Fee amount is set
3. User has a wallet balance override configured

**Support chat doesn't open**: Check browser console for:
1. `prime:open-support` event dispatching
2. JavaScript errors
3. Make sure user has some wallet activity (> $0 total)

**Database errors**: Verify:
1. All environment variables are set in Netlify
2. Supabase SQL script ran successfully
3. Service role key has proper permissions

---

## ✨ Summary

- ✅ Red support button now properly opens support chat
- ✅ User can write message describing their issue
- ✅ Message appears in support chat interface
- ✅ Contact Support icon displayed below message
- ✅ Site configured for Netlify deployment
- ✅ Complete Supabase SQL schema provided
