# Telegram Compensation Evidence

Tadqeeq uses Telegram as the branch evidence capture channel. The deterministic marketplace audit engines remain unchanged.

## Server secrets

Configure these server-only environment variables:

- `TELEGRAM_BOT_TOKEN` — token issued by BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — a random secret used by Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- `TADQEEQ_PUBLIC_URL` — optional production origin override, for example `https://your-domain.example`. If omitted, the Compensation Center uses the authenticated browser request origin when activating the webhook.

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

Preferred:

1. Record the order evidence video.
2. Send it to the branch group.
3. Put the order number in the video caption.

Fallback:

1. Send the video without a caption.
2. Reply to that exact video with the order number only.

The webhook stores the Telegram `file_id`, `file_unique_id`, message identity, sender, branch, timestamp, and a private thumbnail. It does **not** copy the full video into Supabase Storage.

## Compensation employee workflow

1. Search the order number in **مركز التعويضات**.
2. Select the Telegram evidence.
3. When Jahez compensation source data contains the same order, Tadqeeq shows that deterministic source transaction as a suggestion.
4. Enter or confirm the platform, amount, recorded compensation reason, and the branch explanation.
5. Generate the Arabic and English review request.
6. Copy the message and open the original Telegram evidence when needed.

The draft asks the aggregator to review the case. It does not automatically declare a compensation recoverable.
