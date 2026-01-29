# Setup Checklist

Use this checklist when setting up a new app from this template.

## Initial Setup

- [ ] Clone or use template
- [ ] Run `npm install`
- [ ] Copy `.env.example` to `.env`
- [ ] Fill in Firebase config in `.env`
- [ ] Fill in RevenueCat API key in `.env`

## Firebase Setup

- [ ] Create Firebase project at https://console.firebase.google.com
- [ ] Enable Authentication (Email/Password)
- [ ] Enable Firestore Database
- [ ] Get web config from Project Settings > General > Your apps > Web
- [ ] Copy config values to `.env`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`

## RevenueCat Setup

- [ ] Create RevenueCat account at https://www.revenuecat.com
- [ ] Create new project
- [ ] Add iOS app (App Store Connect)
- [ ] Add Android app (Google Play Console)
- [ ] Create "pro" entitlement
- [ ] Create products/packages
- [ ] Get public API key
- [ ] Add to `.env` as `EXPO_PUBLIC_REVENUECAT_API_KEY`

## App Customization

- [ ] Edit `src/config/appConfig.ts`:
  - [ ] Change `appName`
  - [ ] Define quota types
  - [ ] Set `revenueCatEntitlementId`
- [ ] Customize theme in `src/theme/theme.ts`
- [ ] Update `app.json`:
  - [ ] App name, slug
  - [ ] Bundle identifiers
  - [ ] Icons (add to `assets/`)

## Development

- [ ] Install Firebase CLI: `npm install -g firebase-tools`
- [ ] Start emulators: `firebase emulators:start`
- [ ] Start Expo: `npm start`
- [ ] Test auth flow (sign up/in)
- [ ] Test quota system
- [ ] Test paywall (requires dev client)

## Build & Test

- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Configure EAS: `eas build:configure`
- [ ] Build dev client: `eas build --profile development --platform ios`
- [ ] Install dev client on device
- [ ] Test RevenueCat purchases
- [ ] Test quota enforcement

## Optional Features

- [ ] Install dictation widget (if needed)
- [ ] Implement offline-first mode (if needed)
- [ ] Add custom screens/routes
- [ ] Customize UI components

## Deployment

- [ ] Update version in `app.json`
- [ ] Build production: `eas build --profile production --platform all`
- [ ] Submit to App Store / Play Store
- [ ] Deploy Firebase Functions: `firebase deploy --only functions`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
