import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCrwK76Xj5KxbWp36ELrzBBvrBr8pH9bT4",
    authDomain: "forth-inventory.firebaseapp.com",
    projectId: "forth-inventory",
    storageBucket: "forth-inventory.firebasestorage.app",
    messagingSenderId: "870647627386",
    appId: "1:870647627386:web:882707545026df3ed645c3",
    measurementId: "G-WX9CBXTZ5B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
