// SafarX Firebase Client Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js';

export const firebaseConfig = {
  apiKey: "AIzaSyAx_rsCCq63ytcg_0z8Ly1YgS2Se5BpEgw",
  authDomain: "safarx-513ce.firebaseapp.com",
  projectId: "safarx-513ce",
  storageBucket: "safarx-513ce.firebasestorage.app",
  messagingSenderId: "117765643772",
  appId: "1:117765643772:web:ced9598a090ab73e00e679",
  measurementId: "G-LQVQ857L7L"
};

// Initialize Firebase Client
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuthInstance = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

// Initialize Analytics (browser-supported check)
export let firebaseAnalytics = null;
isSupported().then(supported => {
  if (supported) {
    firebaseAnalytics = getAnalytics(firebaseApp);
  }
}).catch(() => {
  // Graceful fallback for non-browser / test environments
});

