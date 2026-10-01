# Telegram Compensation Evidence

Tadqeeq uses Telegram as the branch evidence capture channel. The deterministic marketplace audit engines remain unchanged.

## Server secrets

Configure these server-only environment variables:

- `TELEGRAM_BOT_TOKEN` — token issued by BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — a random secret used by Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- `TADQEEQ_PUBLIC_URL` — the public HTTPS origin Telegram calls, for example `https://tadqeeq.app`. Required in production.

Never expose the bot token or webhook secret to browser code.

## Activate the webhook

1. Open **مركز التعويضات**.
2. Confirm the bot is detected.
3. Click **تفعيل Webhook**.
4. Tadqeeq registers `/api/public/telegram-webhook` with Telegram using the configured secret token.

## Connect a branch group

1. Enter the branch name in Tadqeeq.
2. Generate a one-time code.
3. In the branch's private Telegram group, add the Tadqeeq bot.
4. Make the bot a group admin (minimal required admin rights are fine), **or** disable Group Privacy for the bot in @BotFather and re-add it to the group. Telegram privacy mode is enabled by default and otherwise ordinary cashier video messages will not reach the bot.
5. Send `/connect CODE`.
6. The code expires after 30 minutes and is cleared after successful use.

One Telegram group can be connected to only one Tadqeeq branch mapping.

## Cashier workflow

1. Take a photo or video of the order and its receipt.
2. Send it to the branch group.
3. Tadqeeq reads the order number from the caption, or from the receipt in the photo (Tadqeeq AI).
4. If no number can be read, reply to that exact message with the order number only.
5. To correct a wrong number, reply to the original evidence with the right number.

## Where the evidence lives

> Tadqeeq does not copy Telegram photos or videos into Supabase Storage, or anywhere else. It stores the Telegram evidence reference and retrieves the media from Telegram only when an authorised user previews or downloads it.

What Tadqeeq stores per evidence (metadata only, in `telegram_order_evidence`):

- workspace, branch and branch group;
- order number (as detected or corrected) and its lookup key;
- Telegram `chat_id` and `message_id` (the message reference);
- Telegram `file_id` (used to fetch the file) and `file_unique_id`;
- the Telegram `file_id` of the small preview, when Telegram provides one;
- media type, duration, file size, sender, caption and capture time.

It never stores image or video bytes, base64 media, a copied thumbnail, a Telegram download URL or the bot token.

### Preview and download

1. The browser calls `GET /api/compensation/evidence/:evidenceId/media` with the user's session.
2. The server checks the session, the `telegram.read` permission, the workspace and the user's branch access.
3. The server calls Telegram `getFile` with the stored `file_id` and streams the bytes straight back.
4. Responses carry `Cache-Control: no-store, private, max-age=0`, `Pragma: no-cache` and `X-Content-Type-Options: nosniff`.
5. The preview is held only in that browser tab's memory and released when it closes. **تنزيل** saves the file on the user's computer; nothing remains in Tadqeeq.

The Telegram file URL contains the bot token, so it is never returned to the browser.

### Limits and failures

- The standard Telegram Bot API lets a bot download files up to **20 MB**. Larger files show a message asking staff to open them in the branch group.
- If the message was deleted in Telegram, or Telegram can no longer return the file, the evidence row stays visible with its order number, branch and capture time, and the media shows as unavailable. Tadqeeq does not fall back to an old copy.
- Previewing or downloading never deletes anything: the original photo or video always stays in the branch's Telegram group. Retention and deletion are controlled by the group itself.

### Earlier versions

Before October 2026, Tadqeeq also saved thumbnails (and, briefly, full files) in the `telegram-evidence-thumbnails` bucket. New evidence no longer writes there and the app no longer reads from it. Existing objects are left untouched until their retention is decided; removing them and the bucket is a separate, explicitly approved step.

## Compensation employee workflow

1. Search the order number in **مركز التعويضات**.
2. Select the Telegram evidence.
3. When Jahez compensation source data contains the same order, Tadqeeq shows that deterministic source transaction as a suggestion.
4. Enter or confirm the platform, amount, recorded compensation reason, and the branch explanation.
5. Generate the Arabic and English review request.
6. Copy the message and open the original Telegram evidence when needed.

The draft asks the aggregator to review the case. It does not automatically declare a compensation recoverable.
