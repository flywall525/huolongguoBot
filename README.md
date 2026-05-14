# huolongguoBot

Production uptime monitoring.

## How it works

GitHub Actions runs `scripts/check.js` every 5 minutes (cron `*/5 * * * *`).
The script probes two endpoints; on failure it posts an alert to a Feishu bot.

## Required GitHub Secrets

| Name | Description |
|---|---|
| `FEISHU_WEBHOOK_URL` | Feishu custom bot webhook URL |
| `FEISHU_WEBHOOK_SECRET` | Feishu webhook signing secret |
| `PROD_DOMAIN` | Production API origin, e.g. `https://example.com` |

## Manual run

Actions tab → **Health Check** → **Run workflow**.

## Local dry-run

```bash
FEISHU_WEBHOOK_URL=... FEISHU_WEBHOOK_SECRET=... PROD_DOMAIN=https://example.com node scripts/check.js
```
