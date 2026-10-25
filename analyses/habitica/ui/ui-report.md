# Habitica: UI evidence from its Google Play listing

> Source: Google Play's public listing, fetched 2026-10-25 (`hl=ko` and `hl=en&gl=US`). The structured data is in `index.json`, and the images are in `ui/play/`.
> Claims cite image IDs such as [P01]. Claims marked *(inferred)* come from reading the images and were not checked against the app or its code.

## 1. Listing facts

| Field | Value |
|---|---|
| Title | Habitica: Gamify Your Tasks |
| Package | `com.habitrpg.android.habitica` (confirmed from the search results page) |
| Developer | HabitRPG, Inc. (dev id 7023585019856140116) |
| Rating | 4.6 (4.642), 76,007 ratings. Histogram 1-5 stars: 2,400 / 1,081 / 2,884 / 8,535 / 61,094 |
| Reviews | 3,943 (en-US), 372 (ko) |
| Installs | 5,000,000+ (raw estimate 8,389,823) |
| Content rating | Everyone / 3세 이상 |
| Category | Productivity |
| Price | Free. Contains ads. In-app purchases cost $0.99-$47.99 per item (₩1,200-₩64,900) |
| Released / Updated | 2015-12-10 / 2026-10-05 |
| Version | 4.10.6. This comes from the "What's new" header; the web page has no version field |
| Min Android | 8.0 |
| What's new | Enhanced Achievements: an unlock notification, a new achievement type, and a toast for stacked streak achievements |
| Data safety | May share Personal info and App info/performance. Collects Personal info, App info/performance, and Device IDs. Data is encrypted in transit. Users can request deletion |
| Permissions | network access and state, run at startup, vibration, wake lock |
| Website / support | https://habitica.com · mobile@habitica.com · privacy policy at https://habitica.com/static/privacy |
| Short description | EN: "Treat your life like a game to stay motivated and organized!" / KO: "인생을 게임처럼 즐기면서 동기를 부여하고 계획적인 삶을 사세요!" |

The full English and Korean descriptions are stored in `index.json` under `listing.full_description`. The Korean page shows the English release notes. The listing carries an **Editor's Choice** badge [P01].

## 2. Archived images (15 total)

- **Phone:** 8 screenshots, 1344×2688 PNG [P01–P08].
- **Wear OS:** 5 screenshots, 792×792 PNG [P09–P13].
- **Branding:** the icon is 512×512 [P_ICON] and the feature graphic is 1024×500 [P_FEATURE].

| ID | Screen | Feature | Marketing frame | Key UI evidence |
|---|---|---|---|---|
| P01 | Habits list with avatar header, dark theme | tasks | yes | Pixel avatar tile with "Lvl 53 Rogue". Bars for HP 36/50 (red), XP 570/1,370 (yellow) and MP 123/136 (blue). Hourglass, gold and gem counters. Task rows with colored control strips. Rotated-square FAB. Hamburger menu, search and filter |
| P02 | Task card variety, light theme | tasks | yes | Habit card with +/- buttons and a streak counter "▸▸ 9". Daily card with "Today" and an 8:00 AM reminder. To Do card with checklist 1/3 and due "In 2 days". Bottom nav labels "To Do's" and "Rewards" |
| P03 | New Daily editor | task-editor | yes | Purple header with filled fields for Title and Notes. Checklist adder. Difficulty picker with four levels (Trivial, Easy, Medium, Hard) drawn as sparkle icons. Start date, Repeats and Every-N-Days fields. The caption contains the typo "Flexbile" |
| P04 | Rewards | rewards | yes | Custom reward cards with a gold-coin price block on the right (3, 20, 100). The 100-gold block is grey, *(inferred)* because the user cannot afford it |
| P05 | Pets & Mounts grid | pets | yes | "SPECIAL PETS" header with a 65 / 480 counter. 4-column sprite grid. Pets the user does not own appear as grey silhouettes |
| P06 | Achievements | achievements | yes | "Starting Objectives" card with a progress bar and shield badges. "3 Perfect Days" and "21 Day Streak" medals |
| P07 | Challenges | challenges | yes | Cards with a gem prize icon, member count, and task counts (calendar and check icons), with stacked task previews |
| P08 | Party and Quest | party | yes | Boss "Vice, the Shadow Wyrm" at 1224/1500 HP, with a two-tone bar showing pending damage and a "21 Damage Done" banner. Member rows show an avatar, @handle, HP and MP bars, level and the "Leader" role |
| P09 | Wear: Habits | wear-tasks | no | "6 Habits". Pill rows with circular +, - or split +/- buttons |
| P10 | Wear: score feedback | wear-feedback | no | Green pills showing gains: +14 XP, +2 gold, +.5 mana and .6 sword (quest damage, *inferred*) |
| P11 | Wear: menu | wear-nav | no | User name header. Primary "New Task" pill. Dailies 7, To Do's 12 |
| P12 | Wear: stats rings | wear-stats | no | Concentric HP, XP and MP rings with pixel-font numerals (41/50, 50/620, 35/68) |
| P13 | Wear: avatar | wear-avatar | no | Full-bleed pixel avatar with a pet and a background |
| P_ICON | App icon | branding | no | Lavender gryphon on purple #6a30d3, with a pixel-staircase tail |
| P_FEATURE | Feature graphic | branding | yes | "habitica" wordmark with red and cyan dots on the i's, over a purple-to-blue gradient with confetti |

Each image has a 6-color palette in `index.json`, calculated with median-cut plus k-means. In P01–P08 the marketing background color comes out as the top cluster: purple, blue, red, green, orange or teal. The actual UI colors appear only as minority clusters.

## 3. UI patterns across screens

**Navigation**
- The phone app combines a hamburger drawer with bottom navigation for the task types and Rewards [P01][P02].
- Secondary screens use a top bar with a back arrow, a title, and a filter icon on the right [P03][P05][P08].
- The task list has a FAB for adding tasks [P01].
- The watch replaces this with a vertical pill menu ("New Task", Dailies, To Do's) [P11].

**Core data model visible in the UI**
- There are four task types: Habit (+/- buttons with a counter), Daily (schedule, due chip and reminder), To Do (due date and checklist) and Reward (gold cost) [P02][P03][P04][P09].
- Tasks have a difficulty level: trivial, easy, medium or hard [P03].
- The user has HP, XP and MP, plus gold, gems and hourglasses, and a level and class [P01][P12].
- The social side consists of a party, members, a quest boss with HP, and challenges that contain tasks [P07][P08].

**Component library**
- Task cards have a colored left control strip, a body with title, notes and meta chips, and an optional right-hand counter or control [P01][P02].
- Stat bars are thin rounded bars with an icon, a label and a value pair [P01][P08]. The watch shows the same stats as rings [P12].
- Other components:
  - pills and chips: count pill [P05], streak "▸▸ n" [P02], checklist fraction badge [P02]
  - Material-3-style filled text fields and dropdowns [P03]
  - the four-level difficulty picker [P03]
  - grid tiles with locked silhouettes [P05]
  - full-width action banners [P08]
  - member rows [P08]
  - rounded cards with a soft glow [P06][P07]

**Color meaning**
- Stats use red for HP, yellow or orange for XP, and blue for MP, both on the phone and on the watch [P01][P08][P12].
- The color of a task's strip shows how well the user is doing with it: red, orange and yellow mean weak, and green, cyan and blue mean strong. The P02 caption ("Colors show which tasks you're good at") and the app description ("Color coded tasks") both say so.
- Gold and orange mark currency and damage [P04][P08], and green marks a positive result [P10].
- The brand color is purple, around #6a30d3 to #925ef0 [P_ICON][P03][P11].
- Both a dark theme [P01][P09–P12] and a light theme [P02–P08] exist; the description mentions "Customizable color themes".

**Icons and art**
- Two visual languages are mixed. The interface itself uses flat vector icons (calendar, check-circle, filter, search) and rounded sans-serif text. The game content uses pixel-art sprites for avatars, pets, bosses, gear, badges and currency [P04][P05][P06][P08][P13].
- The marketing captions use a pixel font, and the numerals on the watch stats screen are in a pixel font as well [P12].

**Typography (impressions only)**
- The UI text looks like Roboto or a similar geometric sans in a few weights. Section headers are uppercase and letter-spaced ("SPECIAL PETS", "MEMBERS") [P05][P08].
- The pixel display font appears only in marketing captions and in game-style numbers [P12].

## 4. Open questions

1. P02, P04, P06 and P07 look like composites with exploded or floating cards. It is not confirmed which of them match real screens one-to-one.
2. The exact strip-color thresholds per task value need a check against the source code, e.g. `habitica-android` task color resources.
3. In P07, it is not confirmed whether the calendar and check counts on challenge cards are the number of Dailies and To Dos.
4. In P04 and P08, the meaning of the grey reward price (unaffordable?) and of the two-tone boss bar (pending damage before the daily reset?) is still an assumption.
5. There is no screenshot of the drawer, the avatar customizer, the shop or market, inventory, settings or widgets. All of them are mentioned in the description.
6. The listing says "Contains ads", but no ad UI appears in any screenshot.
7. The ds:9 blob shows 72,879 ratings while the main blob shows 76,007. Play is serving cached data of different ages, and the larger figure is used here.
