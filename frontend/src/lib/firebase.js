import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCMEOnfT-dTvo2NJdvHwvbcTxCBMKQ23lY",
  authDomain: "outreachos-7980.firebaseapp.com",
  projectId: "outreachos-7980",
  storageBucket: "outreachos-7980.firebasestorage.app",
  messagingSenderId: "368195081871",
  appId: "1:368195081871:web:4b978fb704f1b6f27202fa",
  measurementId: "G-4051MJ3XFK",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
