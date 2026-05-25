# Telegram remote control

Daedalus can bridge the active interactive CLI session to a Telegram bot DM. The built-in extension stays inert until you explicitly start it with `/remote-control telegram on` (or `/rc on`).

Telegram remote control is for one trusted operator controlling the current local Daedalus session from a private DM. It is not a general multi-user chat bot.

## Quick setup

1. In Telegram, open [BotFather](https://t.me/BotFather), run `/newbot`, and copy the bot token.
2. Find your numeric Telegram user ID. Do not use your `@username` for authorization.
3. Export the bot token and numeric allowlist before starting Daedalus:

   ```bash
   export DAEDALUS_TELEGRAM_BOT_TOKEN="123456:bot-token"
   export DAEDALUS_TELEGRAM_ALLOW_USER_IDS="123456789"
   bun run dev
   # In Daedalus interactive mode:
   # /remote-control telegram on
   ```

4. Daedalus prints a six-digit pairing code.
5. DM that six-digit code to your bot.
6. Send `/help` in the bot DM to see the supported v1 commands.

Stop the bridge from Daedalus with `/remote-control telegram stop` or `/rc stop`. You can also send `/disconnect` from Telegram.

## Finding your numeric Telegram user ID

Telegram usernames are mutable labels, not authorization identities. Daedalus only trusts numeric Telegram user IDs from `message.from.id`.

Safe options:

- DM the bot from the intended account and read the local rejection/pairing log or diagnostic line when Daedalus prints one. It should show the numeric `message.from.id`; copy only that number, not a username.
- Use the Bot API `getUpdates` fallback:

  ```bash
  curl "https://api.telegram.org/bot$DAEDALUS_TELEGRAM_BOT_TOKEN/getUpdates"
  ```

  Then find your DM update and copy `message.from.id` into `DAEDALUS_TELEGRAM_ALLOW_USER_IDS`.

For multiple trusted operators, use comma-separated numeric IDs:

```bash
export DAEDALUS_TELEGRAM_ALLOW_USER_IDS="123456789,987654321"
```

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `DAEDALUS_TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from BotFather. Keep it out of source control. |
| `DAEDALUS_TELEGRAM_ALLOW_USER_IDS` | Strongly recommended | Comma-separated numeric Telegram user IDs allowed to pair/control the session. Usernames are never accepted. |
| `DAEDALUS_TELEGRAM_DM_POLICY` | No | One of `pairing`, `allowlist`, or `disabled`. Defaults to `pairing`. There is no `open` policy in Daedalus v1. |

`pairing` is the default: an allowed user must DM the one-time six-digit code shown in the local Daedalus CLI before commands are accepted. `allowlist` skips the code but still requires a private DM from an allowed numeric user ID. `disabled` prevents the bridge from starting.

The extension uses a workspace lock at `.daedalus/telegram-remote.lock` so only one long-polling bridge consumes updates for a bot/workspace at a time.

## Remote commands

Send these commands in the paired private bot DM:

| Command | Behavior |
| --- | --- |
| `/status` | Show whether the local Daedalus session is idle or busy, plus session details. |
| `/last` | Re-send the last assistant answer captured from the local session. |
| `/abort` | Ask the local session to interrupt the current turn. |
| `/steer <message>` | Send steering text to the current turn. |
| `/follow-up <message>` | Queue a follow-up message for the next turn. |
| `/disconnect` | Clear the Telegram binding and stop the bridge. |
| Plain text | Starts a new Daedalus turn only when the local session is idle. |

All other Telegram slash commands are rejected. For example, `/model`, `/login`, `/bash`, `/workspace`, and `/remote-control` are intentionally not executable over Telegram.

Daedalus replies with only final assistant answers in v1. It does not stream every token or edit messages live while a turn is running.

## Precedents and scope

This feature is deliberately narrower than the reference implementations it studied.

OpenClaw references:

- `/home/likas/Research/harnesses/openclaw/docs/channels/telegram.md`
- `/home/likas/Research/harnesses/openclaw/extensions/telegram/src/telegram-ingress-worker.ts`
- `/home/likas/Research/harnesses/openclaw/extensions/telegram/src/telegram-ingress-spool.ts`
- `/home/likas/Research/harnesses/openclaw/src/plugin-sdk/channel-ingress-runtime.ts`
- `/home/likas/Research/harnesses/openclaw/src/plugin-sdk/channel-message.ts`
- `/home/likas/Research/harnesses/openclaw/src/infra/exec-approval-channel-runtime.ts`

Daedalus borrows OpenClaw's grammY Telegram Bot API precedent, long-polling bridge shape, pairing/allowlist thinking, deterministic reply routing, per-chat sequencing, and single-poller safety. Daedalus does not adopt OpenClaw's group channel model or remote approval runtime in v1.

FreeCode references:

- `/home/likas/Research/harnesses/free-code/src/commands/bridge/bridge.tsx`
- `/home/likas/Research/harnesses/free-code/src/bridge/bridgeMain.ts`
- `/home/likas/Research/harnesses/free-code/src/bridge/bridgeMessaging.ts`
- `/home/likas/Research/harnesses/free-code/src/bridge/bridgeConfig.ts`
- `/home/likas/Research/harnesses/free-code/src/bridge/bridgePermissionCallbacks.ts`
- `/home/likas/Research/harnesses/free-code/src/bridge/replBridgeTransport.ts`
- `/home/likas/Research/harnesses/free-code/src/types/textInputTypes.ts`

Daedalus borrows FreeCode's current-conversation `/remote-control` UX, inbound message/control routing, disconnect semantics, echo dedupe, and remote-origin slash filtering. Daedalus does not implement FreeCode's remote web app, QR URL bridge, multi-session spawn modes, or remote permission responses in v1.

## v1 exclusions

Telegram remote control v1 excludes:

- Group chats, supergroups, and channels. Only private DMs are supported.
- Remote approvals or remote permission responses for tool execution.
- Token/message edit streaming. Only final assistant answers are sent back.
- A remote web app, hosted web control plane, or QR URL bridge.
- Multi-session selection, spawning, or switching from Telegram.

Keep the local terminal as the authority for approvals, model/account changes, workspace changes, and session management.

## Troubleshooting

- **`DAEDALUS_TELEGRAM_BOT_TOKEN is required`**: export the BotFather token before starting the bridge.
- **User rejected**: confirm `DAEDALUS_TELEGRAM_ALLOW_USER_IDS` contains the numeric `message.from.id` for your Telegram account.
- **Pairing never completes**: send only the six-digit code shown by Daedalus, in a private DM with the bot.
- **Bridge already running**: stop the other Daedalus Telegram bridge for this workspace/bot, or remove a stale `.daedalus/telegram-remote.lock` only after confirming no other bridge process is active.
