# Study Buddy — Build & Deploy Guide

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli eas-cli`
- Apple Developer account (for iOS)
- Google Play Console account (for Android)

## Setup

```bash
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, etc.
npm install
```

## Run locally

```bash
npx expo start          # Expo Go / dev client
npx expo start --ios    # iOS simulator
npx expo start --android # Android emulator
```

## Run tests

```bash
npm run test:run
```

## EAS Build

```bash
eas login

# iOS (TestFlight)
eas build --platform ios --profile production

# Android (Play Store AAB)
eas build --platform android --profile production

# Both platforms
eas build --platform all --profile production
```

## Push Notifications Setup

- **iOS (APNs)**: Upload `.p8` key in Expo dashboard → Credentials
- **Android (FCM)**: Add `google-services.json` to project root, configure in `app.json`

## Supabase Setup

1. Create project at supabase.com
2. Run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_functions.sql`
   - `supabase/migrations/003_add_push_token.sql`
3. Enable Storage bucket `attachments` (public)

## Environment Variables (EAS Secrets)

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_OPENAI_API_KEY --value "..."
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_API_KEY --value "..."
```
