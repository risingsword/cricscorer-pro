import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDzX3o3-WZCljw61pOUhhxs-SfrMJU3b9E",
  authDomain: "cricket-scorer-6f0ed.firebaseapp.com",
  projectId: "cricket-scorer-6f0ed",
  storageBucket: "cricket-scorer-6f0ed.firebasestorage.app",
  messagingSenderId: "664124362855",
  appId: "1:664124362855:web:0c58487e1de256df90c4c2",
  databaseURL: "https://cricket-scorer-6f0ed-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export default app;
