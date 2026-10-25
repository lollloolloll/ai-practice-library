# Habitica Android — static source analysis

- Repo: https://github.com/HabitRPG/habitica-android (GPL-3.0), commit `52fbfd7a1bc76b153fb55fba7220644798de54b2` (2026-10-19), analyzed 2026-10-25.
- Method: shallow clone, read-only. Nothing was built or run. Machine-readable data is in `source.json` (62 evidence, 46 findings, 83 screens, 216 colors).
- Tags: **O** = observed, **I** = inferred, **U** = unknown. "None found" only covers the files and greps listed.

## 1. Identity
- **O** The package is `com.habitrpg.android.habitica`. Version 4.11.0, code 27850 [F1,F2,S2,S3].
- **O** minSdk 26, target/compile SDK 37, Wear OS target 36 [F3,S4].
- **O** 4 modules: `:Habitica` (phone), `:wearos` (same applicationId), `:common` (theme/res/API host), `:shared` (Kotlin Multiplatform) [F4,S1,S57,S58].
- **O** The UI mixes two toolkits. Of 653 .kt files, 125 use ViewBinding and 77 use Compose; there are 228 XML layouts. Compose screens are often hosted inside Fragments [F5,S59].
- **O** Main libraries: Hilt, Retrofit 3, OkHttp 5, Gson, Realm Java 10.19, Navigation safeargs, Paging, WorkManager, Glance, Coil 3, Credential Manager / Google ID [F6,S5].
- **O** Firebase: Crashlytics, Messaging, Remote Config and Performance. The Firebase Analytics library is not in the bundle [F8].
- **O** Flavors: dev, staff, setup, partners, alpha, beta, prod. Build types: debug, debugIAP, release (R8) [F7,S6].

## 2. Manifest
- **O** Permissions: INTERNET, NETWORK_STATE, SCHEDULE_EXACT_ALARM, VIBRATE, BILLING, BOOT_COMPLETED, POST_NOTIFICATIONS. Biometric permissions are explicitly stripped [F9,S9].
- **O** Verified app links on `https://habitica.com`:
  - MainActivity: the whole host
  - PrefsActivity: `/settings/*`
  - FullProfileActivity: `/profile/*`
  - Nav graph: ~40 more patterns + `habitica://user/tasks/{taskType}` [F10,S10,S14].
- **O** Other exported components: TaskReceiver (`NOTIFY`), DeviceCommunicationService (wear), 2 widget-config activities. **U** whether TaskReceiver checks callers [F11].
- **O** 7 widget providers, also implemented with Glance, plus an upgrade-migration receiver. Widgets: stats, avatar, dailies list, to-do list, habit button, dailies count, add task (single and multi) [F12,S11,S60].
- **O** `allowBackup=false`. A custom networkSecurityConfig exists but was not read (**U**) [F46].

## 3. Navigation and screens
- **O** The shell is `MainActivity`. It has a drawer (`NavigationDrawerFragment`) and a custom bottom bar with 4 tabs: Habits, Dailies, To-Dos, Rewards. The bar has a cutout with a center "+" button. Everything sits on one nav graph [F13,S19,S14].
- **O** Onboarding is one Compose flow: Intro → Login (local, Google, Apple) → Username → Avatar setup [F14,S18].
- Screens per feature area (full list with purposes in `screens[]`, 83 entries) [F15]:

  | Area | Screens | Key screens |
  |---|---|---|
  | Auth | 7 | Onboarding, Login, Setup, AdventureGuide, Maintenance |
  | Tasks | 7 | TasksFragment pager, TaskForm, TaskSummary, Yesterdailies |
  | Avatar | 7 | AvatarCustomization / Equipment (Compose), ClassSelection, FullProfile |
  | Inventory | 8 | Items, Stable, Pet/Mount detail, Armoire |
  | Shops / money | 14 | 5 shops, Gems, Subscription, Gift gems / subscription, promos |
  | Social | 16 | Party, PartyChat, PartySeeking, Guild, QuestDetail, Inbox |
  | Challenges | 4 | Overview, Detail, Form |
  | Stats | 5 | Stats, Skills, Achievements |
  | Notifications | 2 | Notifications, News |
  | Settings | 11 | Preferences, Account, Privacy, FAQ, BugFix |
  | Widgets | 2 | widget config screens |

## 4. Design system
- **Brand (O):** purple ramp brand_50 `#36205D` → brand_800 `#F6F4FC`; brand_300 `#6133B4` = brand bg/notification, brand_400 `#925CF3` = accent; launcher `#5A2CC8` [F16,S20].
- **Grays (O):** 11 steps from gray_1 `#1A181D` to gray_700 `#F9F9F9`.
- **Hue ramps (O):** 7 hues (maroon to blue), each in about 9 tones from `_700` (lightest) to `_1` (extra dark) [S20].
- **Dark mode (O)** works through values-night overrides [F17,S21,S23]:

  content_background `#FFFFFF`→`#1A181D`, window_background `#F9F9F9`→`#23202A`, brand_background `#6133B4`→`#34313A`, text_primary gray_50→gray_700, brand `#432874`→`#925CF3`.
- **Color themes (O):** the base is Material3 DynamicColors DayNight. Users can pick default purple or Red, Maroon, Orange, Yellow, Green, Teal or Blue; each has a Dark variant [F18,S28,S29].
- **Stat colors (O):** HP `#FF6165`, XP `#FFBE5D`, MP `#50B5E9`, gem `#24CC8F` [F22,S62].
- **Task value → color (O)** [F21,S30]:

  | Task value | Color | light `_100` | dark `_10` |
  |---|---|---|---|
  | < −20 | maroon | #DE3F3F | #B01515 |
  | < −10 | red | #FF6165 | #F23035 |
  | < −1 | orange | #FF944C | #F47825 |
  | < 1 | yellow | #FFBE5D | (`_5`) #EE9109 |
  | < 5 | green | #24CC8F | #1CA372 |
  | < 10 | teal | #3BCAD7 | #26A0AB |
  | ≥ 10 | blue | #50B5E9 | #2995CD |

- **Typography (O):** system `sans-serif` / `sans-serif-medium`, no bundled phone font. Compose scale: display 20/28sp, title 16/14sp, body 14sp (16sp line), label 14/12sp, captions 12sp. Wear OS uses Press Start pixel font [F19,S24,S25].
- **Radius and spacing (O)** [F20,S26,S27]:
  - Compose shapes: 4, 8, 12dp
  - Corners: checkbox 4dp, stat bar 5dp, button 12dp, bottom sheet 20dp
  - Spacing scale: 4, 8, 16, 32dp; side spacing 25dp; screen margin 16dp; card padding 12dp; stat bar height 8dp
- **Icons (O):** PaintCode-generated vector drawing code (`HabiticaIcons.java`) plus 250 drawables. Game sprites load from S3 [F23,S31,S36].
- **Reusable components (I, names and usages only):** bottom nav, HabiticaButton, HabiticaSnackbar (typed), LabeledBar, CurrencyView, PixelArtView, AppHeaderView, DeathOverlay [F24].

## 5. Data and API
- **O** The API base is `BuildConfig.BASE_URL` + `/api/v4/`. The example config sets BASE_URL to `https://habitica.com`. **I** Production is `https://habitica.com/api/v4/`, because the real properties file is not committed [F25,F26,S8,S33].
- **O** Every request sends the headers `x-api-user`, `x-api-key` and `x-client: habitica-android` [S35].
- **I** Credentials are stored with a KeyStore-based helper [F45,S56].
- **O** S3 host `habitica-assets.s3.amazonaws.com/mobileApp/`: `endpoint/` (maintenance JSON), `images/` (sprites) [F27,S34,S36].
- **O** `ApiService.kt` declares 136 endpoints [F28,S32]:

  user 46 (buy, equip, feed, hatch, cast, revive, auth/*), groups 25 (chat, invite, quests), tasks 21 (CRUD, `score/{direction}`, bulk-score), misc 10 (status, content, cron…), challenges 9, members 8, iap 4, tags/notifications/inbox 3 each, shops/hall 2 each.
- **O** Core models: Task, User, Stats, Items, Preferences, Group, Challenge, ChatMessage, InboxConversation, SubscriptionPlan, OwnedPet/Mount [S61].
- **O** Local storage is Realm with `deleteRealmIfMigrationNeeded` (the local DB is wiped instead of migrated). Each data area has a network repository plus a Realm repository [F29,S37,S38].
- **O** Sync is pull-based and the server is the authority [F30,S39,S40]:
  - The app fetches the full user (+tasks) when forced or after more than 3 minutes, then writes it to Realm.
  - New tasks are saved locally first with a UUID, then sent to the API.

## 6. Game mechanics in client code
- **O** Task scoring happens on the server via `POST tasks/{id}/score/up|down`. A local predictive scorer exists but is behind the Remote Config flag `enableLocalTaskScoring`, which defaults to false [F31,S40,S42].
- **O** The local scorer's formulas, from `ScoreTaskLocallyInteractor` [F32,S41]:
  - delta = 0.9747^value, with value clamped to [−47.27, 21.27]
  - To-dos multiply delta by (1 + completed checklist items)
  - XP += round(delta × (1 + 0.025·INT) × priority × 6)
  - Gold += delta × priority × (1 + 0.02·PER) × (1 + streak/100)
  - HP −= |delta| × max(0.1, 1 − CON/250) × priority × 2
  - On level-up, HP is set to 50
  - Stat points come from level/2 (max 50) + buffs + allocated points. A gear list is built but never used.
- **O** Missed dailies: if `needsCron`, the app shows the "Yesterdailies" dialog for unchecked dailies that were due yesterday, then calls `POST cron`. The damage formula is not in the client (**U**) [F33,S43].
- **O** Fainting: the user counts as fainted when HP ≤ 0, and a DeathOverlay appears (revive endpoint). Subscribers get a once-a-day "second chance" that sets HP to 1 [F34,S44,S45].
- **O** Level-up shows a dialog. At level 10 it prompts class selection [F35,S46].
- **O** Item drops are decided by the server. The client only shows a snackbar and plays a sound [F36,S47].
- **I** Streak rules are server-side [F37].

## 7. Monetization and tracking
- **O** Play Billing products [F38,S48,S49]:
  - Gems: `iap.4gems`, `21gems`, `42gems`, `84gems` (sale amounts 5 / 30 / 60 / 125)
  - Subscriptions: `subscription.1/3/6/12month`
  - Gift subscriptions: `norenew_subscription.1/3/6/12month`
  - Pet: `iap.pets.gryphatrice_jubilant`
  - Purchases are verified on the server via `/iap/android/*`. Prices are not in the source (**U**).
- **O** No ad SDK was found in the build files or sources [F39,S12,S13,S42]. What remains:
  - an AdMob APPLICATION_ID placeholder in the manifest
  - three ad flags in Remote Config (armoire, faint, spell), all off, with no code that reads them
- **O** Tracking: Crashlytics + Firebase Performance only with user consent; Firebase Analytics disabled in manifest; no event-logging API [F40,S50,S51].
- **O** FCM push with 10 types (party/guild/quest invites, new PM, gifts, challenge won, username change); reminders use exact alarms [F41,S52].

## 8. i18n
- **O** 23 locales ship (localeFilters and locales_config), including **ko** [F42,S53].
- **O** `values-ko/strings.xml` has 1540 strings vs 1615 in the base file (about 95%) [F43,S55].
- **O** Mismatch: `lt` is listed but there is no `values-lt` folder. The ar, cs, da, ro, sk, sr, sv and es-419 translations exist but are left out of the build [F44,S54].

## Unknowns (details in `unknowns[]`)
Release BASE_URL and keys; server damage/drop/streak formulas; live Remote Config values; TaskReceiver input checks; network security config; Play version vs HEAD; SKU prices; component specs.
