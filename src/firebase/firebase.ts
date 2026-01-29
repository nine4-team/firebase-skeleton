import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';
import { Platform } from 'react-native';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

const useEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const hasMissingConfig = Object.values(firebaseConfig).some((value) => !value);
export const isFirebaseConfigured = !hasMissingConfig;
if (hasMissingConfig) {
  console.warn(
    '[firebase] Missing EXPO_PUBLIC_FIREBASE_* environment variables. ' +
      'Auth and Firestore calls will fail until .env is configured.'
  );
}

if (isFirebaseConfigured) {
  // Initialize Firebase
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  // Initialize Auth
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      });
    } catch (error) {
      auth = getAuth(app);
    }
  }
  if (useEmulators && auth) {
    try {
      const authHost = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || 'localhost';
      const authPort = process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || '9099';
      connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    } catch (error) {
      // Emulator already connected
    }
  }

  // Initialize Firestore
  db = getFirestore(app);
  if (useEmulators && db) {
    const firestoreHost = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_HOST || 'localhost';
    const firestorePort = process.env.EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT || '8080';
    try {
      connectFirestoreEmulator(db, firestoreHost, parseInt(firestorePort, 10));
    } catch (error) {
      // Emulator already connected
    }
  }

  // Initialize Functions
  functions = getFunctions(app);
  if (useEmulators && functions) {
    const functionsHost = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST || 'localhost';
    const functionsPort = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT || '5001';
    try {
      connectFunctionsEmulator(functions, functionsHost, parseInt(functionsPort, 10));
    } catch (error) {
      // Emulator already connected
    }
  }
}

export { auth, db, functions };
