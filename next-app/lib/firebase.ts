import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: Record<string, string | undefined>;
  }
}

function getEnv(key: string): string | undefined {
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.[key]) {
    return window.__RUNTIME_CONFIG__[key];
  }
  return process.env[key];
}

const firebaseConfig: Record<string, string | undefined> = {
  apiKey: getEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
};

if (typeof window !== 'undefined') {
  console.log('--- Firebase Env Debug ---');
  console.log('API Key:', firebaseConfig.apiKey ? 'Loaded' : 'MISSING');
  console.log('Auth Domain:', firebaseConfig.authDomain ? 'Loaded' : 'MISSING');
  console.log('Project ID:', firebaseConfig.projectId ? 'Loaded' : 'MISSING');
  console.log('--------------------------');
}

const isClient = typeof window !== 'undefined';
const hasConfig = Object.values(firebaseConfig).every((v) => v && v.length > 0);

let app: ReturnType<typeof initializeApp> | undefined;

if (isClient && hasConfig) {
  const config = {
    apiKey: firebaseConfig.apiKey!,
    authDomain: firebaseConfig.authDomain!,
    projectId: firebaseConfig.projectId!,
    storageBucket: firebaseConfig.storageBucket!,
    messagingSenderId: firebaseConfig.messagingSenderId!,
    appId: firebaseConfig.appId!,
  };
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
}

export const auth = app ? getAuth(app) : null;
export default app;
