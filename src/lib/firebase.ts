import { initializeApp, type FirebaseApp } from '@firebase/app'

/**
 * Firebaseはプッシュ通知（FCM）の受信にだけ使う。
 * データの読み書きはすべてAPI（Cloudflare Worker）経由で、ブラウザからFirestoreには触れない。
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** .envが未設定でもアプリ本体は動くようにガードする（通知だけが使えない） */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const app: FirebaseApp | undefined = isFirebaseConfigured ? initializeApp(firebaseConfig) : undefined
