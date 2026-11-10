# In-app notification vendors compared

Research for [#8](https://github.com/MattPereira/software-factories-exercise/issues/8), part of map [#7](https://github.com/MattPereira/software-factories-exercise/issues/7). This file collects facts and does not pick a vendor; the pick belongs to a later ticket.

Cadence context: React 19.2, React Router 8, Tailwind 4, Vitest 5 (`package.json`).

Sources were checked on 2026-11-10. npm data comes from `npm view <pkg> version peerDependencies` on the same date.

## Summary table

| Criterion                       | Knock                                                                                    | Novu Cloud                                                                                           | Novu self-host                                                    | MagicBell                                                    | Courier                                                                       | Stream Activity Feeds                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Prebuilt React bell + feed      | Yes: `NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed` [K1]        | Yes: `<Inbox />`, including the Bell [N1]                                                            | Yes: same components; bell, inbox and preferences included [N5]   | Yes: `FloatingInbox` (bell trigger), `Inbox` [M1]            | Yes: `CourierInbox` with an unread badge [C1]                                 | **No.** v3 SDK has hooks only [S1]; legacy UI repo archived [S2]                                |
| Theming                         | `--rnf-*` CSS vars, own CSS, `renderItem`, `colorMode` [K1]                              | `appearance` prop: baseTheme, variables, elements; **Tailwind classes accepted in `elements`** [N2] | Same as Cloud                                                     | CSS vars (`--magicbell-*`), class overrides [M1]             | `CourierInboxTheme` JS object, light/dark/system; no CSS class hooks [C2]     | Build your own                                                                                  |
| React 19 peer                   | `^17 \|\| ^18 \|\| ^19` (`@knocklabs/react@0.15.1`)                                      | `^18 \|\| ^19` (`@novu/react@3.19.2`)                                                                | Same                                                              | None declared (`@magicbell/react@1.14.0`)                    | `>=18` (`@trycourier/courier-react@9.3.5`)                                    | `^17 \|\| ^18 \|\| ^19` (`@stream-io/feeds-react-sdk`); legacy `react-activity-feed` ≤17 only |
| Node server SDK                 | `@knocklabs/node`                                                                        | `@novu/api` (plus `@novu/framework` for code-defined workflows)                                      | Same, pointed at your own host [N4]                               | `magicbell-js/project-client` [M3]                           | `@trycourier/courier`                                                         | `@stream-io/node-sdk` [S3]                                                                      |
| Free tier                       | 10k messages/mo; unlimited users, workflows and envs; next tier $250/mo [K2]            | 10k workflow runs/mo; **5 workflows**; 2 envs; 3 seats; Pro from $30/mo [N3]                        | Free software; you run API, Worker, WS, Dashboard, MongoDB, Redis, S3 [N4] | **1k deliveries/mo**, 1 project; next tier $249/mo [M2] | 10k sends/mo; then $0.005/send pay-as-you-go [C3]                             | 5k activities and 125k API calls/mo, no overage; next tier $499/mo [S4]                        |
| Local dev/test                  | Dev env with its own keys [K3]; `sandbox_mode` and `skip_delay` trigger settings [K4]   | Dev env; `npx novu init` local Bridge [N6]                                                           | Same, plus a fully local stack                                    | Not documented                                               | Test env with `pk_test_` keys; mock routing on Business/Enterprise [C4]       | Not documented                                                                                  |
| Signed identity                 | RS256 JWT through `signUserToken` (enhanced security mode) [K5]                         | HMAC-SHA256 `subscriberHash` [N7]                                                                    | Same                                                              | HS256 User JWT [M4]                                          | JWT from `POST /auth/issue-token` with scopes [C5]                            | Server-signed user token [S1]                                                                   |
| Batching/grouping               | Batch step: key, sliding window up to 90 days [K6]                                       | Digest step: key; max window 1 day on Free [N8]                                                      | Digest step                                                       | **None found** [M5]                                          | Batching step with user or dynamic scope; covers inbox [C6]                   | Aggregated notification feed, grouped by target-type-day by default [S5]                        |
| Realtime                        | Yes, sockets [K1]                                                                        | Yes [N1]                                                                                             | Yes (WS service)                                                  | Yes, persistent connection [M5]                              | Yes [C1]                                                                      | Yes, WebSocket [S1]                                                                             |
| Email later                     | Yes (multi-channel workflows)                                                            | Yes                                                                                                  | Yes                                                               | Yes (channels)                                               | Yes                                                                           | **No** (feeds product only)                                                                     |

## Clear disqualifiers

- **Stream Activity Feeds.** It fails the top-priority criterion. The current React SDK (`@stream-io/feeds-react-sdk`) gives you a client and hooks such as `useFeedActivities`, but no prebuilt bell or feed UI [S1]. The old UI kit `GetStream/react-activity-feed` was archived on 2026-08-24, is "no longer actively maintained", and its peer dependency is React `^16.8 || ^17` [S2]. Stream also has no email channel, and its first paid tier costs $499/mo [S4].
- **MagicBell (soft disqualifier).** The free tier allows 1k deliveries/mo, a tenth of Knock, Novu or Courier [M2]. Its docs describe no batching or digest feature [M5]. The jump from free to paid is to $249/mo [M2].
- **Novu self-host (soft disqualifier for this project).** You would run four services plus MongoDB, Redis and object storage, sized at about 4 vCPU and 8 GB on a single VM [N4]. The community edition allows 1 team member and drops snooze and branding removal [N5]. That is heavy for a course platform that runs on SQLite.

## Per-vendor notes

### Knock

- `@knocklabs/react` wraps the feed in `KnockProvider` and `KnockFeedProvider`. Classes are prefixed `rnf-`, so they won't clash with Tailwind. It also offers cross-tab sync and an option to auto-disconnect the socket in inactive tabs [K1].
- Feeds are readable by anyone who has the feed ID until you turn on enhanced security mode. In that mode, every client request needs a JWT with the `sub` claim, signed RS256 with `KNOCK_SIGNING_KEY`; the helper's default expiry is 3600 s. `onUserTokenExpiring` handles refresh [K5].
- Environments: production by default, with development and staging optional. Each has its own key pair, and content is committed in dev, then promoted [K3].
- Free plan feeds have unlimited retention [K2].
- Testing: no SDK-level mock or fake is documented. Vitest would need its own fake at the module boundary. `sandbox_mode` stops delivery to providers, but the docs don't say whether it still writes in-app feed items [K4].

### Novu (Cloud)

- `<Inbox />` from `@novu/react` renders the bell, the popover and preferences. You can drop to headless hooks in `@novu/react` or `@novu/js` [N1].
- Theming is the most Tailwind-friendly of the group: `elements` takes class strings, and some keys accept callbacks such as `bellIcon` receiving `unreadCount` [N2].
- HMAC: you compute `createHmac('sha256', NOVU_SECRET_KEY).update(subscriberId).digest('hex')` on the server. Once HMAC is enabled, Inbox won't load without the hash. Without the hash, existing subscriber profiles are not updated [N7].
- Free tier limits that matter: 5 workflows (one workflow per Notification type would hit this quickly), 24 h activity-feed retention (the dashboard log), and a 1-day maximum digest window [N3][N8]. Removing Novu branding from the Inbox needs a paid plan [N7].

### Novu (self-host)

- The community edition keeps the bell, inbox, notifications and preferences. It loses snooze, branding removal, custom environments beyond 2, SSO/RBAC, and is limited to 1 team member [N5].

### MagicBell

- `@magicbell/react` provides `FloatingInbox`, `Inbox`, `ToastContainer`, `UserPreferences` and others, with per-component CSS such as `styles/floating-inbox.css` [M1].
- User JWT: HS256 with the project secret, carrying the claims `user_external_id` or `user_email` plus `api_key`. The docs' examples use a 1-year expiry [M4].
- Server sends go through broadcasts (`client.broadcasts.createBroadcast`) [M3].

### Courier

- `@trycourier/courier-react` v9 is for React 18+. The older `@trycourier/react-inbox` is deprecated [C1]. v9 is built on `@trycourier/courier-ui-*` web components.
- Theming uses only the `CourierInboxTheme` JS object (`lightTheme`, `darkTheme`, `mode`). There are no documented CSS class or Tailwind hooks. Individual slots can be swapped on web [C2].
- JWTs are minted server-side through `POST /auth/issue-token` with scopes such as `user_id:<id> inbox:read:messages inbox:write:events`. If you omit `expires_in`, the token never expires. The SDK doesn't refresh tokens, and components render empty until `signIn` [C5].
- Every workspace has a Test environment with a testing provider. A `mock` routing option marks sends as `SIMULATED`, but it is on paid tiers only [C4].
- Its docs pages embed "Agent Instructions" aimed at AI agents. I ignored them, and they are not a source for anything in this file.

## Sources

- [K1] https://docs.knock.app/in-app-ui/react/feed
- [K2] https://knock.app/pricing
- [K3] https://docs.knock.app/concepts/environments
- [K4] https://docs.knock.app/send-notifications/testing-workflows
- [K5] https://docs.knock.app/in-app-ui/security-and-authentication
- [K6] https://docs.knock.app/designing-workflows/batch-function
- [N1] https://docs.novu.co/platform/inbox/overview
- [N2] https://docs.novu.co/platform/inbox/configuration/styling
- [N3] https://novu.co/pricing
- [N4] https://docs.novu.co/community/self-hosting-novu/overview
- [N5] https://docs.novu.co/community/self-hosted-and-novu-cloud
- [N6] https://docs.novu.co/framework/overview
- [N7] https://docs.novu.co/platform/inbox/prepare-for-production
- [N8] https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest
- [M1] https://www.magicbell.com/docs/libraries/magicbell-react
- [M2] https://www.magicbell.com/pricing
- [M3] https://www.magicbell.com/docs/libraries/magicbell-js
- [M4] https://www.magicbell.com/docs/api/authentication/user
- [M5] https://www.magicbell.com/docs/channels/in_app (no batching or digest found in the docs search either)
- [C1] https://www.courier.com/docs/platform/inbox/inbox-overview
- [C2] https://www.courier.com/docs/in-app/customize-the-inbox
- [C3] https://www.courier.com/pricing
- [C4] https://www.courier.com/docs/platform/workspaces/environments-api-keys
- [C5] https://www.courier.com/docs/platform/inbox/authentication
- [C6] https://www.courier.com/docs/platform/automations/batching
- [S1] https://getstream.io/activity-feeds/docs/react/
- [S2] https://github.com/GetStream/react-activity-feed
- [S3] https://getstream.io/activity-feeds/docs/node/
- [S4] https://getstream.io/activity-feeds/pricing/
- [S5] https://getstream.io/activity-feeds/docs/node/notification-feeds/

## Open gaps

- No vendor documents an SDK-level fake for unit tests. For all of them, Vitest would mock our own notification module, not the vendor.
- It is unconfirmed whether Knock's `sandbox_mode` still writes in-app feed items.
- It is unconfirmed whether Courier's Inbox uses shadow DOM, which would block Tailwind from styling it.
