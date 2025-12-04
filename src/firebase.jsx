export const initializeAuth = async () => {
  try {
    const { initializeApp, getAuth, signInAnonymously, getFirestore } = firebase;
    
    const firebaseConfig = {
      apiKey: "AIzaSyAdzZqATJXSl5WgRxD6jLh2ZhIB8-z3wog",
      authDomain: "crypto-money-talk.firebaseapp.com",
      projectId: "crypto-money-talk",
      storageBucket: "crypto-money-talk.firebasestorage.app",
      messagingSenderId: "183021719346",
      appId: "1:183021719346:web:8a1f90c59793cd8cc5d12b"
    };

    const app = initializeApp(firebaseConfig);
    window.auth = getAuth(app);
    window.db = getFirestore(app);
    
    await signInAnonymously(window.auth);
  } catch (error) {
    console.error('Auth error:', error);
  }
};

export const auth = window.auth;
export const db = window.db;