import { auth, googleProvider, db } from '../firebase';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';

export const withTimeout = (promise, timeoutMs = 15000, errorMsg = "Operation timed out") => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
    ]);
};

export const signInWithGoogle = async (setStatus) => {
    const platform = Capacitor.getPlatform();
    try {
        if (platform !== 'web') {
            const nativeAuthFlow = async () => {
                if (setStatus) setStatus('Initializing GoogleAuth...');
                await GoogleAuth.initialize({
                    clientId: "664124362855-j5j8esg7vj2oje0j9lt4p8j6qi2omtjh.apps.googleusercontent.com",
                    scopes: ["profile", "email"],
                    grantOfflineAccess: true
                });
                
                if (setStatus) setStatus('Opening Google Accounts list...');
                const googleUser = await GoogleAuth.signIn();
                
                const idToken = googleUser.authentication?.idToken;
                if (!idToken) throw new Error("Missing idToken from Google.");
                
                if (setStatus) setStatus('Verifying with Google...');
                const credential = GoogleAuthProvider.credential(idToken);
                
                const authPromise = signInWithCredential(auth, credential);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Firebase auth timed out (15s)")), 15000)
                );
                
                const result = await Promise.race([authPromise, timeoutPromise]);
                if (setStatus) setStatus('Login Successful!');
                return result.user;
            };

            const overallTimeout = new Promise((_, reject) => 
                 setTimeout(() => reject(new Error("Google Login Stalled (30s)")), 30000)
            );

            return await Promise.race([nativeAuthFlow(), overallTimeout]);
        } else {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            return result.user;
        }
    } catch (error) {
        console.error('Sign in error:', error);
        throw error;
    }
};

export const generateCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
};
