# Sidequest

A simple time manager with a parent dashboard and a child's pixel RPG world.

## Run

Use Node.js 24 and pnpm 10.24.0.

```sh
pnpm install
pnpm dev --port 5173
```

- http://localhost:5173/parents opens the parent dashboard.
- http://localhost:5173/ opens directly into the child's full-screen game. Walk with WASD or arrow keys, jump with Space, and interact with E near a location. Touch controls include a Jump button. A bouncing red number above a villager shows how many of their quests today are still to do. Click it or press E beside them to talk. A quest leaves the count once it is submitted, and comes back if a parent sends it back. The number disappears when none are left. Villagers without quests have no marker; stand beside them and press E to chat. The **Journal** button at the top lists all of today's quests. Press Esc to open the menu, or tap the gear button on touch screens. It holds the **Alarm clock**, **Keybinds**, **Settings** (villager voices) and **AI helper**. Keybinds change the walk, jump, interact and AI helper keys to any letter, number, symbol or Space; arrow keys always walk. Choosing a key that another action uses swaps the two. Keybinds are saved on that browser. The game screen shows no on-screen key tips; the Keybinds page lists every key. The child interface has no parent dashboard link; open `/parents` directly.

Parents assign study, chores or exercise with XP and gold rewards. Children submit finished quests. Parent approval awards each dated quest's rewards once. When all of today's quests are approved, the daily screen-time allowance unlocks. The child can start or pause the countdown. Adding work today locks the clock until it is finished, preserving the remaining balance without granting a second allowance.

The parent calendar supports one-time tasks, daily tasks, and weekly tasks on selected weekdays. Future assignments do not block today. Past submissions remain available for review, while the child's journal shows today's quests. Household dates use the timezone recorded when the family was created. A new day resets the allowance and creates fresh recurring quests. Unused time expires at midnight; parent blocking stays active.

The parent dashboard has Sage, Apricot, and Cocoa themes. The selection is saved on that browser. There is one child and a small village with three villagers who hand out quests (Poppy the housekeeper, Ambrose the librarian and Bram the blacksmith) and three who just like to chat (Biscuit the dog, Gill the angler and Hazel the gardener).

## Villagers

Every task has a category, and each category has a villager who hands it out: chores from Poppy the housekeeper, the girl with the butterfly by the cottage; exercise from Bram the blacksmith; and study tasks such as reading, homework and practice from Ambrose the librarian, the old man outside the library. A bouncing red number above each one's head shows how many of their tasks are still to do today. A task leaves the count when it is submitted and returns if a parent sends it back. The number disappears when none are left. Talk to them by clicking the number or pressing E beside them. Their lines change with the task, so each one gets its own task, reward and comment (Poppy comments on dishes, beds, tidying, rubbish, laundry, pets, meals, plants, sweeping, windows, shopping or polishing; Bram on running, walking, cycling, swimming, ball games, stretching, jumping, strength, dancing or climbing; Ambrose on reading, spelling, writing, maths, science, history, languages, music, art, coding or general study), plus separate lines for tasks awaiting approval and for a finished day. "I did it!" submits the task for parent approval, like the quest journal.

Biscuit the dog by the cottage, Gill the angler at the lake and Hazel the gardener in the field have no quests. They make small talk that suits them (Biscuit mostly says woof), and each visit, or "Pat Biscuit", "Any bites?" or "Tell me more", moves on to their next line. Their chats are in `src/game/smallTalk.ts`. Tasks saved under the older Garden category load as chores.

The dialogue box, word highlighting and audio player are copied from Learnspace. Bram speaks with the ElevenLabs voice and settings Learnspace uses for Bram (Bill, `eleven_multilingual_v2`). Ambrose speaks with George, a warm British storyteller voice, Poppy with Jessica, a bright, playful voice, Biscuit with Charlie, Gill with Roger and Hazel with Laura, all on the same model. Lines include the child's name and task titles, so they are generated on demand. The Convex action `speech:speak` accepts only a linked child device's token. It sends the line to ElevenLabs, stores the MP3 and word timings in Convex file storage keyed by a hash of the text and voice, and returns the audio. Each distinct line is billed once. Without a key, or in browser-local mode, the dialogue still works and shows "Voice unavailable."

Set the key on each Convex deployment; it never reaches the browser:

```sh
npx convex env set ELEVENLABS_API_KEY <key>          # development
npx convex env set ELEVENLABS_API_KEY <key> --prod   # production, before deploying
node scripts/verify-speech.mjs https://your-deployment.convex.cloud
```

The check links a fresh test family, confirms parent and unlinked tokens are refused, requests one short line in each voice, and checks the MP3, word timings, cache reuse and that each voice is cached separately.

## Spark, the AI helper

Spark is a small fairy that floats beside the child's character. Press Q, or the **Ask Spark** button at the top, to talk to it. Children can ask what they need to do today, how to get screen time, or how the game works. They can also ask everyday questions. For homework, Spark gives hints instead of answers. When a child says they finished a quest, such as "I finished my reading", Spark sends that quest to the parent for approval. It works like "I did it!" in the journal.

Spark can read the child's game: today's quests and their status, the next week's quests, XP, level, gold, screen time, the alarm and this device's keys. It has one tool, which sends one of today's to-do quests for approval. The Convex action `spark:ask` accepts only a linked child device's token. The tool runs `spark:submit`, an internal mutation that applies the child's `submit` command and nothing else. Spark cannot approve or change quests, rewards, screen time, the alarm or anything on the parent dashboard.

The menu's **AI helper** page changes Spark's name and voice: Matilda (Spark's Learnspace voice, the default), Will, Alice, Liam, River or Callum, each with a preview. The name and voice are saved on that browser. Spark's sprite and portrait are Learnspace's original Spark art, imported with `scripts/import-learnspace-ui.py`.

Spark uses Claude (`claude-opus-5-5`, low effort, with Anthropic's default refusal fallback) through the Anthropic TypeScript SDK. Each message sends the child's name, the family's quest titles and status, and the conversation to Anthropic. Replies are spoken with ElevenLabs like the villagers, so each new reply is billed once. Set the key on each Convex deployment; it never reaches the browser:

```sh
npx convex env set ANTHROPIC_API_KEY <key>          # development
npx convex env set ANTHROPIC_API_KEY <key> --prod   # production, before deploying
```

Without a key, or in browser-local mode, Spark still opens and greets the child, but questions show "Spark is not set up yet."

Every message also passes two safety checks by Claude Haiku 5.5 (`claude-haiku-5-5`), using the policy in `shared/spark.ts`:

- The child's message is checked at the same time as Opus writes its reply. If it suggests the child may be unsafe (self-harm, abuse, an adult asking for secrets or a meeting, serious bullying, an emergency), Spark discards the AI reply and gives a fixed answer telling them to talk to a trusted adult now. Requests for content unsuitable for children get a fixed "let's talk about something else" answer. Quests are sent for approval only after this check passes.
- Spark's reply is checked before it is shown or spoken. A reply that fails is replaced by "Can you ask me in a different way?"

The checks fail closed. If either check errors, times out or returns an unexpected answer, the child sees "could not check that safely" and nothing from the model. Each check costs a small fraction of the Opus reply.

Flagged chats go to the parent **Inbox** at `/parents/inbox`, opened from the Inbox link in the dashboard's top navigation. The link shows how many alerts are new. Each alert shows the child's message, when it was sent and what Spark did. Its label is one of: "May need your help" (the child may be unsafe), "Inappropriate request" (the message or Opus was refused), or "Spark answer held back" (a reply that failed its check, which the parent can expand). If the child says a parent or caregiver at home is the one hurting them, no alert is sent, and Spark tells the child to talk to a teacher or another relative instead. Opening the inbox marks alerts as read. The parent can remove any alert. Alerts are stored in the Convex `sparkAlerts` table, and only the latest 100 per family are kept. Only a parent token can read or change them, through `spark:inbox` and `spark:editInbox`. The child's AI helper page tells the child that worrying messages are shared with their parent.

## Daily wake-up alarm

The alarm is separate from quests, XP, gold, and screen-time allowances. Parents set a daily time in the household timezone. Every family has an alarm control, initially off with a 7:00 AM default. Saving a passed time schedules the next day.

In the game menu's **Alarm clock** page, children choose Classic bells, Morning chimes, or Birdsong and enable sound on their device. The alarm starts at a moderate gain and increases every two seconds to a fixed maximum. System volume still controls the device's output. The daily challenge rotates between whack-a-mole, memory pairs, and number order. Beating it stops the sound. Five minutes later, a different game opens with one minute to finish. Missing that window starts the sound again. Completing the second game finishes the alarm for that day.

Keep the child page open with sound enabled. The optional screen wake lock can keep a visible page awake. A closed page cannot ring, and browsers may suspend audio or delay timers while hidden or asleep. This website is not a reliable replacement for an operating-system alarm. See [browser autoplay rules](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) and [Chrome background timer behavior](https://developer.chrome.com/blog/timer-throttling-in-chrome-88).

Parents can disable or reschedule the alarm. Completed game submissions identify the scheduled run, so a delayed submission cannot dismiss a rescheduled alarm. Repeat submissions preserve the original completion time. Alarm-only commands do not change the quest board or play clock.

## Linking the views

Without configuration, both views share a browser-local IndexedDB board. Open parent and child views in two tabs on the same origin and browser profile. Updates arrive through BroadcastChannel, with storage and focus refresh fallbacks. The UI labels this mode “On this browser”.

For separate devices, configure Convex:

```sh
pnpm dev:backend --dev-deployment cloud
```

The CLI writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`. Restart Vite. A fresh browser creates a demo family automatically, and Game and Parents open the same board. Use **Link a device** in the parent menu to copy a child invitation. An explicit invitation joins that family without granting parent permissions.

Hosted mode uses atomic Convex mutations and live query subscriptions. Parent and child capabilities are separate and stored as hashes on the backend. Child commands cannot create or approve quests. An unavailable hosted connection does not silently switch to a different local board. HTTP mutations, role checks and live WebSocket updates have been verified against the production deployment.

This is an app prototype. Its clock tracks the shared allowance inside Sidequest; it does not control operating-system screen-time settings or block other apps. Browser-local mode has no account or PIN boundary.

## Game art

The village uses the supplied **Farm - 4 Seasons 16x16 Tileset** and **NPC - Characters** packs by antarcticbees. Original PNG files are in `public/assets/farm/`. `manifest.json` records each source archive, entry, dimensions and SHA-256 hash. The source ZIPs stay in `~/ssh-xfer`.

Re-import the selected files with `python3 scripts/import-game-assets.py`, or pass another archive directory as its first argument. The script uses Python's standard library and copies the original bytes. These are user-supplied commercial assets; retain their original purchase terms.

`src/game/world.ts` defines the 64 × 40 tile map as ASCII terrain rows, the props and villagers with their collision footprints, the fenced field and gate, and the quest doors. The art packs have no forge, so `src/game/forge.ts` draws Bram's stone forge beside him in the same palette. It has a flickering fire, chimney smoke, a coal heap, a water trough, snow in winter and a warm glow at night. `src/game/effects.ts` animates the hero and Spark. The hero breathes while standing, stretches in the air, squashes on landing and kicks up dust. Spark bobs, drifts around the hero while they stand still, glows more at night and leaves a twinkle trail. Devices that ask for reduced motion get none of these effects. `src/game/farmArt.ts` maps every prop and ground tile to atlas crops for each season, and `src/game/farmScene.ts` draws cached terrain, shorelines and depth-sorted sprites. Update `world.ts` when changing the layout; `tests/world.test.ts` checks that every door and the field stay reachable from the start.

The village follows the household's real calendar and clock. `src/game/sky.ts` picks the season from the month in the household time zone, flipping it for southern-hemisphere zones, and tints the scene for dawn, dusk and night with lit windows. During development, add `?season=winter&hour=21.5` to the game URL to preview any season and hour. `PixelWorld.tsx` owns keyboard, touch and click movement independently from shared rewards and the clock. Children can explore immediately, including before screen time unlocks and while the countdown is paused or finished. Parent blocking disables movement; the journal stays accessible. The screen-time countdown separately requires every assigned quest to be approved and an explicit start.

The game UI uses Learnspace's original pixel window frame, SVG icon paths, and play/pause icons. These are separate from the Farm world art and are not applied to the parent dashboard. `public/assets/learnspace-ui/manifest.json` records the source files and hashes. Re-import with `python3 scripts/import-learnspace-ui.py`, or verify the original bytes with `python3 scripts/import-learnspace-ui.py --check`. Pass a Learnspace frontend directory as the optional source argument.

Local fonts are Manrope and Pixelify Sans. Their OFL licenses are in `public/fonts/`. Pixelify Sans comes from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/pixelifysans).

## Check

```sh
pnpm check
```

Runs lint, calendar/reward/clock/role/migration and world-geometry tests, TypeScript checks for frontend/backend/tests, and the production build. Domain logic is in `shared/sidequest.ts`, with timezone-aware date helpers in `shared/calendar.ts`. UI controls send commands rather than changing rewards themselves.

To check a hosted backend explicitly:

```sh
node scripts/verify-hosted.mjs https://your-deployment.convex.cloud
```

This checks real HTTP commands and a WebSocket subscription. Each run creates a fresh test family and two connection records. It does not change existing families or print connection tokens.

For the actual alarm timing sequence, run:

```sh
node scripts/verify-wake-alarm.mjs https://your-deployment.convex.cloud
```

This creates one isolated test family, schedules the next minute, waits through the real five-minute delay and one-minute window, and verifies that a missed follow-up rings again before daily completion. Allow about seven minutes. It retains its test family and device connections.

During development, `/alarm-lab` exercises the actual child alarm interface with an isolated in-memory board. Its clock controls test daily rotation and follow-up timing. **Run audio check** renders real OfflineAudioContext graphs to check gain steps and all three sound signals. This lab is excluded from the production bundle.

The v3 scheduling migration converts existing undated quests into one-time quests on the migration date. It preserves completion, rewards, settings, family IDs, and device connections. Compare private Convex exports before and after migration with:

```sh
python3 scripts/verify-schedule-migration.py before.zip after.zip
```

## Deploy

The deployed app is at https://sidequest-time-manager.vercel.app/ and the parent dashboard is at https://sidequest-time-manager.vercel.app/parents. Use **Link a device** in the parent dashboard to pair a child's browser.

This directory is linked to Vercel project `timbo-hobby/sidequest-time-manager`. Its sensitive production environment variable `CONVEX_DEPLOY_KEY` targets Convex project `marchantresearch/sidequest`, deployment `shiny-chameleon-14`. Local development uses the separate `peaceful-mongoose-27` deployment through `.env.local`.

Deploy later changes from this directory with:

```sh
pnpm check
pnpm dlx vercel@64.2.0 deploy --prod --scope timbo-hobby
```

`vercel.json` runs `pnpm build:vercel`; Convex deploys the backend and supplies the production URL to the frontend build. The Vercel project uses Node.js 24. Environment files and local audit records are excluded from uploads. There is no Git repository or automatic push deployment configured yet.

The only third-party key is the optional `ELEVENLABS_API_KEY` for Bram's voice. See the [Convex Vercel guide](https://docs.convex.dev/production/hosting/vercel).
