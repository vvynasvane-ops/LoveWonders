import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, getDocs,
  query, orderBy, limit, addDoc, onSnapshot, serverTimestamp, where,
  arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export {
  onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail,
  doc, setDoc, getDoc, updateDoc, collection, getDocs,
  query, orderBy, limit, addDoc, onSnapshot, serverTimestamp, where,
  arrayUnion, arrayRemove, increment
};

/** Redirects to index.html if nobody is signed in. Resolves with the user otherwise. */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "index.html";
      } else {
        resolve(user);
      }
    });
  });
}
