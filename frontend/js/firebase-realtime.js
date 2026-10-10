// SafarX Firebase Realtime & Storage Service
import { firebaseDb, firebaseStorage } from './firebase-config.js';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy 
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';

export const FirebaseRealtime = {
  db: firebaseDb,
  storage: firebaseStorage,
  listeners: new Map(),

  /**
   * Driver updates live GPS coordinates to Firestore (Broadcasting)
   */
  async updateDriverLocation(driverId, rideId, lat, lng, speed = 0, heading = 0) {
    if (!driverId) return;
    try {
      const locationDocRef = doc(firebaseDb, 'driver_locations', String(driverId));
      await setDoc(locationDocRef, {
        driverId: String(driverId),
        rideId: rideId ? String(rideId) : null,
        lat,
        lng,
        speed,
        heading,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('[Firebase Firestore] Location update fallback:', err.message);
    }
  },

  /**
   * Customer/Admin listens to live Driver GPS location in Realtime
   */
  subscribeDriverLocation(driverId, callback) {
    if (!driverId) return () => {};
    try {
      const locationDocRef = doc(firebaseDb, 'driver_locations', String(driverId));
      const unsubscribe = onSnapshot(locationDocRef, (snap) => {
        if (snap.exists()) {
          callback(snap.data());
        }
      }, (error) => {
        console.warn('[Firebase Firestore] Realtime location listener:', error.message);
      });
      return unsubscribe;
    } catch (e) {
      console.warn('[Firebase Firestore] Setup listener failed:', e.message);
      return () => {};
    }
  },

  /**
   * Live Ride Seats & Status Realtime Listener
   */
  subscribeRideUpdates(rideId, callback) {
    if (!rideId) return () => {};
    try {
      const rideRef = doc(firebaseDb, 'live_rides', String(rideId));
      const unsubscribe = onSnapshot(rideRef, (snap) => {
        if (snap.exists()) {
          callback(snap.data());
        }
      }, (err) => console.warn('[Firebase Firestore] Ride stream error:', err.message));
      return unsubscribe;
    } catch {
      return () => {};
    }
  },

  /**
   * In-Ride Live Chat / Alert Messages
   */
  subscribeRideMessages(rideId, callback) {
    if (!rideId) return () => {};
    try {
      const q = query(collection(firebaseDb, `rides/${rideId}/messages`), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(messages);
      });
    } catch {
      return () => {};
    }
  },

  async sendRideMessage(rideId, sender, text) {
    if (!rideId || !text) return;
    try {
      await addDoc(collection(firebaseDb, `rides/${rideId}/messages`), {
        sender,
        text,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[Firebase Firestore] Send message error:', e.message);
    }
  },

  /**
   * Firebase Storage: Upload Driver Documents (RC, Driving License, Car Photos)
   */
  async uploadDocument(file, path) {
    if (!file) throw new Error('No file provided');
    const storageRef = ref(firebaseStorage, `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  }
};

window.SafarXRealtime = FirebaseRealtime;
