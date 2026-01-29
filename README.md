# ExpoFirebaseSkeleton

A GitHub template for Expo + React Native apps with:

- Firebase Auth + Firestore-ready foundation
- Expo Router navigation
- `@nine4/ui-kit` theming + primitives
- RevenueCat entitlements (Pro)
- Configurable freemium quotas
- Optional **offline-first** data module (local-first + sync)

## Quick Start

### 1. Use this template

Click "Use this template" on GitHub, or clone and customize:

```bash
git clone <your-repo-url>
cd expo-firebase-skeleton
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Firebase and RevenueCat credentials:

```bash
cp .env.example .env
```

Required:
- `EXPO_PUBLIC_FIREBASE_*` - Firebase web config (from Firebase Console)
- `EXPO_PUBLIC_REVENUECAT_API_KEY` - RevenueCat public API key

### 3. Customize App Config

Edit `src/config/appConfig.ts`:

- `appName`: Your app name
- `quotas`: Define quota types (e.g., "memory", "project", "entry")
- `revenueCatEntitlementId`: Your RevenueCat entitlement ID (default: "pro")
- `dataModeDefault`: "online" or "offline" (offline-first not yet implemented)

### 3a. Customize the app logo

- The template uses the example logo at `nine4_logo.png` (repo root).
- Expo icon/splash/adaptive icon are configured in `app.json`.
- In-app logo rendering is centralized in `src/components/BrandLogo.tsx`.

### 4. Run Locally (with Emulators - Recommended)

**Prerequisites:**
- Node.js
- Firebase CLI: `npm install -g firebase-tools`

**Start Firebase Emulators:**
```bash
firebase emulators:start
```

**Start Expo:**
```bash
npm start
```

The app will connect to emulators by default (set `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false` to disable).

### 5. Build for Testing (EAS Build / Dev Client)

RevenueCat IAP requires a **dev client** (not Expo Go):

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build dev client
eas build --profile development --platform ios
# or
eas build --profile development --platform android
```

## Project Structure

```
app/
  (auth)/          # Auth routes (sign-in, sign-up)
  (tabs)/          # Main app tabs (home, settings)
  paywall.tsx      # RevenueCat paywall screen
  _layout.tsx      # Root layout with auth gating

src/
  config/          # App configuration (quotas, entitlements)
  firebase/        # Firebase initialization
  auth/            # Auth store (Zustand)
  billing/         # RevenueCat integration
  quota/           # Quota system
  theme/           # Theme configuration (@nine4/ui-kit)
  components/      # Primitive components (Screen, AppText, AppButton)
  data/            # Repository interface (online/offline)
  features/        # Optional features (dictation widget)
```

## Customization Guide

### Adding a New Quota Type

Edit `src/config/appConfig.ts`:

```typescript
quotas: {
  memory: {
    freeLimit: 10,
    collectionPath: 'users/{uid}/memories',
    displayName: 'memories',
  },
  project: {
    freeLimit: 3,
    collectionPath: 'users/{uid}/projects',
    displayName: 'projects',
  },
}
```

### Using Quotas in Your Code

```typescript
import { canCreate, requireProOrQuota, assertCanCreate } from '@/quota/quotaStore';

// Check if user can create
if (!requireProOrQuota('memory')) {
  router.push('/paywall');
  return;
}

// Assert (throws if quota exceeded)
assertCanCreate('memory');

// Create via Cloud Function (server-side enforcement)
const result = await httpsCallable(functions, 'createWithQuota')({
  objectKey: 'memory',
  collectionPath: 'users/{uid}/memories',
  data: { title: 'My Memory', content: '...' },
});
```

### Adding Optional Dictation Widget

1. Install dependency:
   ```bash
   npm install git+ssh://git@github.com:nine4-team/react-dictation.git
   ```

2. Import in your screen:
   ```typescript
   import { DictationWidget } from '@/features/dictation/DictationWidget';
   ```

3. See `src/features/dictation/README.md` for details.

### Customizing Theme

Edit `src/theme/theme.ts` to customize colors, typography, spacing.

## Recommended Dev Workflow: Firebase Emulators

For day-to-day development, run against the **Firebase Emulator Suite** to avoid accidental costs and to make testing repeatable.

- **Why**: free, fast resets, safe from production data, easy to test offline/sync flows.
- **What's emulated**: Auth, Firestore, (optional) Cloud Functions.

### Run emulators

```bash
firebase emulators:start
```

The app connects to emulators automatically when `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` (default).

### Emulator UI

Access the Emulator UI at `http://localhost:4000` to:
- View/manage Auth users
- Browse Firestore data
- Test Cloud Functions
- Reset emulator data

## Server-Side Enforcement (Recommended Default)

Anything related to **billing / quotas** should be enforced server-side:

- **Security Rules** (`firebase/firestore.rules`) are guardrails to prevent bypassing limits with a modified client.
- **Cloud Functions** (`firebase/functions/src/index.ts`) can implement authoritative "create + increment counter" logic atomically.

Client-side checks are still useful for UX (show paywall early), but they are not enforcement.

### Using the Cloud Function

The template includes `createWithQuota` function:

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/firebase';

const createWithQuota = httpsCallable(functions, 'createWithQuota');

const result = await createWithQuota({
  objectKey: 'object',
  collectionPath: 'users/{uid}/objects',
  data: { /* your data */ },
});
```

## Offline-First vs Online-First (Parameterized)

This template aims to avoid forcing a global decision. Instead, features should call a `Repository<T>` interface, and each app (or entity) can choose:

- **Online-first**: Firestore reads/writes directly (simpler, default).
- **Offline-first**: local DB first (SQLite) + outbox queue + batch sync (more robust, better cost control) - **not yet implemented**.

### Current Implementation

```typescript
import { createRepository } from '@/data/repository';

// Online-first (default)
const repo = createRepository<MyEntity>('users/{uid}/objects', 'online');

// List, get, upsert, delete
const items = await repo.list();
const item = await repo.get('id');
await repo.upsert('id', { name: 'Updated' });
await repo.delete('id');
```

### Cost Levers (Firebase)

Firestore cost usually explodes due to:

- broad / always-on listeners
- repeated list queries that refetch many docs

Default patterns in this template should prefer:

- incremental "pull since cursor" reads
- batched writes (especially from an outbox)
- opt-in listeners only for small, bounded queries

See `src/data/offline-first.md` for future offline-first implementation notes.

## Building & Deployment

### Development Build (Required for RevenueCat)

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Production Build

```bash
eas build --profile production --platform all
```

### Deploy Firebase Functions

```bash
cd firebase/functions
npm install
cd ../..
firebase deploy --only functions
```

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

## Troubleshooting

### RevenueCat not working

- Ensure you're using a **dev client** (not Expo Go)
- Check that `EXPO_PUBLIC_REVENUECAT_API_KEY` is set correctly
- Verify RevenueCat dashboard configuration

### Firebase connection issues

- Check `.env` file has all required Firebase config
- For emulators: ensure `firebase emulators:start` is running
- Check Firebase Console for project setup

### Quota not updating

- Quotas are enforced server-side via Cloud Functions
- Check Firestore rules allow reads to `users/{uid}/quota/{objectKey}`
- Verify Cloud Function is deployed and working

## License

MIT
