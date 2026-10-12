# ChikiDrop

Telegram bot + Telegram Web App. Virtual tickets only; no real-money wagering.

## Features
- Telegram bot with `/start`, `/play`, `/balance`, `/help`
- Web App with card opening for virtual tickets
- Ranks F, E, D, C, B, A with weighted random drops
- Admin command: `/addtickets TELEGRAM_ID AMOUNT`
- Telegram Web App `initData` verification before API requests
- Simple JSON persistence in `data/store.json`

## Deploy on GitHub + Render
1. Upload the contents of this ZIP to a new GitHub repository (or replace the contents of your existing repo).
2. In Render, create a **Web Service** from that repository.
3. Runtime: Docker (Render should detect `Dockerfile`).
4. Add Environment Variables:
   - `BOT_TOKEN` = your new token from @BotFather
   - `ADMIN_ID` = `1502811510`
   - `WEBAPP_URL` = the full Render URL, e.g. `https://chikidrop.onrender.com`
5. Deploy, then open `https://YOUR-RENDER-SERVICE.onrender.com`.
6. In @BotFather, set the bot's menu button to the Web App URL if desired. The bot also replies with an Open ChikiDrop button.

## Important persistence note
The included JSON storage is simple and works for testing, but Render's local filesystem may reset on redeploy/restart. For lasting balances, attach a Render persistent disk mounted at `/app/data`. Do not put a bot token in GitHub or send it in chat. If a token was exposed, revoke it in @BotFather first.

## Admin command
In the bot, send `/addtickets 123456789 100` to add 100 tickets to user `123456789`. Only `ADMIN_ID` can use it. The user must have started the bot at least once before receiving a message, but balance can be initialized regardless.

## Notes
- Telegram Web App must be opened from Telegram to authenticate. Opening the public URL in a regular browser shows a hint.
- This starter intentionally uses virtual tickets only. It does not handle payments or real-money gambling.
