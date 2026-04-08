# Study Buddy

A mobile app for students to manage tasks, notes, and study sessions — built with React Native (Expo) and Supabase.

## Features

- **Task management** — create, track, and prioritize study tasks
- **Notes** — rich note editor with attachment support
- **Calendar** — iCal sync to import university timetables
- **Focus timer** — Pomodoro-style study sessions
- **AI agent** — smart study suggestions (Pro)
- **Push notifications** — deadline reminders
- **Offline support** — queue actions when offline, sync on reconnect
- **i18n** — multi-language support
- **Subscriptions** — free / Pro tiers via RevenueCat

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo Router |
| Backend | Supabase (Postgres + Auth + Storage) |
| State | Zustand |
| Storage | MMKV |
| AI | OpenAI API |
| Payments | RevenueCat |
| Testing | Jest + fast-check (property-based) |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your Supabase URL and anon key

# 3. Run Supabase migrations (in order)
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_functions.sql
# supabase/migrations/003_add_push_token.sql

# 4. Start the app
npx expo start
```

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `EXPO_PUBLIC_OPENAI_API_KEY` | OpenAI API key (Pro feature) |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | RevenueCat API key |

## Running Tests

```bash
npm run test:run
```

## Build & Deploy

See [BUILD.md](./BUILD.md) for full EAS build and deployment instructions.

## License

This project is licensed under [CC BY-NC 4.0](./LICENSE) — free to use and adapt, but **not for commercial purposes**.
