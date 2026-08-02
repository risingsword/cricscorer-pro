import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider, db } from '../firebase';
import { sanitizeInput } from '../utils/sanitize';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { doc, setDoc, getDoc, getDocFromCache } from 'firebase/firestore';
import { useMatch } from '../context/MatchContext';
import { clearMatchCache } from '../utils/dataFetcher';
import NameInput from '../components/NameInput';

const Login = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [showCodeInput, setShowCodeInput] = useState(false);
    const [showNameInput, setShowNameInput] = useState(false);
    const [userName, setUserName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('Verifying Profile...');

    useEffect(() => {
        const local = localStorage.getItem('cricscorer_login');
        const session = localStorage.getItem('userSession');
        if (local || session) {
             try {
                 const data = JSON.parse(local || session);
                 if (data.loginType) {
                     dispatch({ type: 'UPDATE_STATE', payload: data });
                     navigate('/home');
                     return;
                 }
             } catch (e) {}
        }

        if (state.loginType === 'guest') return;

        if (window.location.search.includes('test=true')) {
            const loginData = { loginType: 'guest', userName: 'Tester' };
            localStorage.setItem('cricscorer_login', JSON.stringify(loginData));
            dispatch({ type: 'UPDATE_STATE', payload: loginData });

            if (window.location.search.includes('scenario=5overs')) {
                const matchData = {
                    matchId: `MATCH-TEST`,
                    startTime: Date.now(),
                    team1: { name: 'TeamA', score: 0, wickets: 0, overs: 0, balls: 0 },
                    team2: { name: 'TeamB', score: 0, wickets: 0, overs: 0, balls: 0 },
                    tossWinner: 'TeamA', batFirst: 'TeamA', totalOvers: 5, matchStatus: 'live', currentInnings: 1,
                    innings: [
                        {
                            battingTeam: 'TeamA', bowlingTeam: 'TeamB', runs: 0, wickets: 0, balls: 0, overs: 0,
                            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                            batsmen: [
                                { name: 'Virat', runs: 0, balls: 0, fours: 0, sixes: 0, isStriker: true, isOut: false, wagonData: [] },
                                { name: 'Rohit', runs: 0, balls: 0, fours: 0, sixes: 0, isStriker: false, isOut: false, wagonData: [] }
                            ],
                            bowlers: [{ name: 'Bumrah', overs: 0, maidens: 0, runs: 0, wickets: 0, fours: 0, sixes: 0 }],
                            currentBowlerName: 'Bumrah', matchStatus: 'live', partnerships: [], fallOfWickets: [], timeline: [], thisOver: []
                        },
                        {
                            battingTeam: 'TeamB', bowlingTeam: 'TeamA', runs: 0, wickets: 0, balls: 0, overs: 0,
                            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                            batsmen: [], bowlers: [], partnerships: [], fallOfWickets: [], timeline: [], thisOver: []
                        }
                    ]
                };
                dispatch({ type: 'INIT_MATCH', payload: matchData });
                setTimeout(() => navigate('/live-scoring'), 200);
                return;
            }
            navigate('/home');
        }

        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user && !user.isAnonymous) {
                const localSession = localStorage.getItem('cricscorer_login');
                if (!localSession) {
                    try {
                        const userCodeSnap = await getDoc(doc(db, 'userCodes', user.uid));
                        if (userCodeSnap.exists()) {
                            const userCode = userCodeSnap.data().code;
                            const loginData = {
                                loginType: 'shareable',
                                userCode: userCode,
                                ownerName: user.displayName,
                                ownerEmail: user.email,
                                ownerPhoto: user.photoURL,
                                uid: user.uid
                            };
                            localStorage.setItem('cricscorer_login', JSON.stringify(loginData));
                            dispatch({ type: 'UPDATE_STATE', payload: loginData });
                            navigate('/home');
                        }
                    } catch (e) {
                         console.error("Auth restore error:", e);
                    }
                }
            }
        });

        return () => unsubscribe();
    }, [navigate, dispatch]);

    const withTimeout = (promise, timeoutMs = 15000, errorMsg = "Operation timed out") => {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
        ]);
    };

    const signInWithGoogle = async (setStatus) => {
        const platform = Capacitor.getPlatform();
        try {
            if (platform !== 'web') {
                const nativeAuthFlow = async () => {
                    if (setStatus) setStatus('Initializing GoogleAuth...');
                    await GoogleAuth.initialize({
                        scopes: ["profile", "email"],
                        grantOfflineAccess: true
                    });
                    
                    if (setStatus) setStatus('Opening Google Accounts list...');
                    const googleUser = await GoogleAuth.signIn();
                    
                    const idToken = googleUser.authentication?.idToken;
                    if (!idToken) {
                        throw new Error("Missing idToken from Google. Ensure your SHA-1 is added correctly in Firebase App settings.");
                    }
                    
                    if (setStatus) setStatus('Verifying with Google...');
                    const credential = GoogleAuthProvider.credential(idToken);
                    
                    const authPromise = signInWithCredential(auth, credential);
                    // Inner Timeout safeguard node
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Firebase auth timed out (15s)")), 15000)
                    );
                    
                    const result = await Promise.race([authPromise, timeoutPromise]);
                    if (setStatus) setStatus('Login Successful. Loading App...');
                    return result.user;
                };

                const overallTimeout = new Promise((_, reject) => 
                     setTimeout(() => reject(new Error("Google Login Flow stalled (30s). Please ensure internet connection.")), 30000)
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

    const generateCode = () => {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    };

    const handleGoogleLogin = async () => {
        dispatch({ type: 'LOGOUT' }); // Clear previous state entirely
        setLoading(true);
        setError('');
        try {
            const user = await signInWithGoogle(setStatusText);
            clearMatchCache();

            let shareCode = null;
            if (user) {
                try {
                    const userCodeRef = doc(db, 'userCodes', user.uid);
                    const userCodeSnap = await getDoc(userCodeRef);
                    if (userCodeSnap.exists()) {
                        shareCode = userCodeSnap.data().code;
                    } else {
                        shareCode = generateCode();
                        await setDoc(userCodeRef, {
                            code: shareCode,
                            ownerName: user.displayName,
                            createdAt: new Date()
                        });
                        await setDoc(doc(db, 'shareLogins', shareCode), {
                            ownerUid: user.uid,
                            ownerName: user.displayName,
                            ownerEmail: user.email,
                            ownerPhoto: user.photoURL,
                            code: shareCode,
                            createdAt: new Date(),
                            lastUpdated: new Date(),
                            isLive: false
                        }, { merge: true });
                    }
                } catch (e) {
                    console.warn('[GoogleLogin] Failed to link share code:', e);
                }
            }

            const loginData = {
                loginType: 'google',
                userCode: user.uid,
                shareCode: shareCode,
                ownerName: user.displayName,
                ownerEmail: user.email,
                ownerPhoto: user.photoURL,
                uid: user.uid
            };
            localStorage.setItem('cricscorer_login', JSON.stringify(loginData));
            localStorage.setItem('userSession', JSON.stringify(loginData));
            dispatch({ type: 'UPDATE_STATE', payload: loginData });
            navigate('/home');
        } catch (err) {
            alert('Error: ' + err.message + ' Code: ' + err.code);
            setError(`Google Login failed: ${err.message || err.toString()}`);
        } finally {
            setLoading(false);
        }
    };

    const handleShareableLogin = async () => {
        dispatch({ type: 'LOGOUT' }); // Clear previous state
        setLoading(true);
        setError('');
        try {
            const user = await signInWithGoogle(setStatusText);
            if (!user) throw new Error("No user returned");
            
            // 1. Check userCodes for existing profile
            if (setStatusText) setStatusText('Fetching User Profile from Firestore...');
            const userCodeRef = doc(db, 'userCodes', user.uid);
            const userCodeSnap = await withTimeout(getDoc(userCodeRef), 12000, "Firestore Read Timed Out (12s)");
            
            let userCode;
            let isNew = false;
            
            if (userCodeSnap.exists()) {
                userCode = userCodeSnap.data().code;
            } else {
                if (setStatusText) setStatusText('Generating New User Code...');
                userCode = generateCode();
                isNew = true;
                await withTimeout(setDoc(userCodeRef, {
                    code: userCode,
                    ownerName: user.displayName,
                    createdAt: new Date()
                }), 10000, "Failed to initialize User Code in Firestore");
            }
            
            // 2. Setup/Sync shareLogins document
            if (setStatusText) setStatusText('Saving Session Data to Firestore...');
            const shareLoginRef = doc(db, 'shareLogins', userCode);
            const profileData = {
                ownerUid: user.uid,
                ownerName: user.displayName,
                ownerEmail: user.email,
                ownerPhoto: user.photoURL,
                code: userCode,
                lastUpdated: new Date()
            };

            try {
                if (isNew) {
                    await withTimeout(setDoc(shareLoginRef, {
                        ...profileData,
                        createdAt: new Date(),
                        isLive: false,
                        matches: []
                    }), 20000, "Failed to create Shareable Login in Firestore");
                } else {
                    await withTimeout(setDoc(shareLoginRef, profileData, { merge: true }), 20000, "Failed to update Shareable Login in Firestore");
                }
            } catch (writeErr) {
                console.warn("[Login] Primary Firestore profile write warning:", writeErr);
                // Attempt non-blocking background write so user can still log in
                setDoc(shareLoginRef, profileData, { merge: true }).catch(e => console.error("[Login] Background setDoc error:", e));
            }
            
            const shouldSync = localStorage.getItem('guest_sync_pending') === 'true';
            if (shouldSync) {
                if (setStatusText) setStatusText('Migrating Guest matches to Cloud...');
                try {
                    const { openDB } = await import('idb');
                    const idb = await openDB('CricScorerDB', 1);
                    const guestMatches = await idb.getAll('matches');
                    if (guestMatches.length > 0) {
                        for (const m of guestMatches) {
                            if (m.matchId) {
                                await withTimeout(setDoc(doc(db, 'shareLogins', userCode, 'matches', m.matchId), m), 8000, "Match Sync Timed out");
                            }
                        }
                    }
                } catch (migrateErr) {
                    console.error("Migration Failed:", migrateErr);
                } finally {
                    localStorage.removeItem('guest_sync_pending');
                }
            }

            clearMatchCache();
            const loginData = { 
                loginType: 'shareable', 
                userCode: userCode, 
                ownerName: user.displayName,
                ownerEmail: user.email,
                ownerPhoto: user.photoURL,
                uid: user.uid
            };
            localStorage.setItem('cricscorer_login', JSON.stringify(loginData));
            dispatch({ type: 'UPDATE_STATE', payload: loginData });
            navigate('/home');
            
        } catch (err) {
            console.error("Shareable login fail:", err);
            const codeInfo = err.code ? ` Code: ${err.code}` : '';
            alert(`${err.message || err.toString()}${codeInfo}`);
            setError(`Login failed: ${err.message || err.toString()}`);
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        dispatch({ type: 'LOGOUT' }); // Hard reset
        setLoading(true);
        setError('');
        try {
            await signInAnonymously(auth);
            clearMatchCache();
            const loginData = { loginType: 'guest', userName: 'Guest' };
            localStorage.setItem('cricscorer_login', JSON.stringify(loginData));
            dispatch({ type: 'UPDATE_STATE', payload: loginData });
            navigate('/home');
        } catch (err) {
            setError('Guest Login failed');
        } finally {
            setLoading(false);
        }
    };

    const [recentCodes, setRecentCodes] = useState(() => {
        const saved = localStorage.getItem('recent_profile_codes');
        return saved ? JSON.parse(saved) : [];
    });

    const handleLoginWithCode = async (providedCode) => {
        const targetCode = (providedCode || code).toUpperCase().trim();
        if (targetCode.length < 6) {
            setError('Enter a valid profile code');
            return;
        }

        // CLEAR ALL STALE DATA ENTIRELY
        dispatch({ type: 'LOGOUT' });
        localStorage.removeItem('userSession');
        localStorage.removeItem('cricscorer_login');
        clearMatchCache();

        setLoading(true);
        setError('');

        try {
            const docRef = doc(db, 'shareLogins', targetCode);
            let docSnap;

            try {
                // Try cache first for near-instant response if recently accessed
                docSnap = await getDocFromCache(docRef);
            } catch (e) {
                // Fallback to server
                docSnap = await getDoc(docRef);
            }

            if (docSnap.exists()) {
                const data = docSnap.data();
                const actualOwnerName = data.ownerName || data.userName || 'Someone';
                const sessionData = {
                    loginType: 'code',
                    userCode: targetCode,
                    viewingCode: targetCode,
                    ownerName: actualOwnerName
                };
                const sessionStr = JSON.stringify(sessionData);
                localStorage.setItem('userSession', sessionStr);
                localStorage.setItem('cricscorer_login', sessionStr); // Sync legacy key

                // Save to recent codes
                const updatedRecent = [targetCode, ...recentCodes.filter(c => c !== targetCode)].slice(0, 5);
                setRecentCodes(updatedRecent);
                localStorage.setItem('recent_profile_codes', JSON.stringify(updatedRecent));
                
                // FINAL CLEAR before navigating
                clearMatchCache();

                dispatch({
                    type: 'UPDATE_STATE', payload: {
                        loginType: 'code',
                        userCode: targetCode,
                        ownerName: actualOwnerName
                    }
                });
                navigate('/home');
            } else {
                setError('Invalid code');
                setLoading(false);
            }
        } catch (err) {
            console.error("Login verification failed:", err);
            setError('Verification failed. Check connection.');
            setLoading(false);
        }
    };

    const handlePaste = (e) => {
        const pastedData = sanitizeInput(e.clipboardData.getData('text')).toUpperCase().trim();
        if (pastedData) {
            setCode(pastedData.substring(0, 8));
        }
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#eef2f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>

            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>How to Login? 🏏</h1>
                <p style={{ color: '#64748b', fontSize: '15px', fontWeight: '600' }}>Pick the best option for you</p>
            </div>

            <div className="card animate-fade-in" style={{
                width: '100%',
                maxWidth: '480px',
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.6)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
                marginBottom: '24px'
            }}>

                {/* Shareable Login */}
                <div onClick={handleShareableLogin} className="card" style={{ padding: '24px', cursor: 'pointer', display: 'flex', gap: '20px', border: '2px solid #ea4335', boxShadow: '0 12px 30px rgba(234, 67, 53, 0.15)', background: 'linear-gradient(145deg, #ffffff, #fff5f5)', borderRadius: '24px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="24" height="24" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '800', fontSize: '18px', color: '#1e1b4b', marginBottom: '4px' }}>Shareable Login (Google)</div>
                        <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500', lineHeight: '1.5' }}>Create owner profile with match access token.</div>
                    </div>
                </div>

                {/* Profile Code Login */}
                <div onClick={() => { setShowCodeInput(true); setError(''); }} className="card" style={{ padding: '24px', cursor: 'pointer', display: 'flex', gap: '20px', border: '1px solid white', borderRadius: '24px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '24px' }}>🔑</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '800', fontSize: '18px', color: '#1e1b4b', marginBottom: '4px' }}>Got a Profile Code?</div>
                        <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500', lineHeight: '1.5' }}>Access a profile shared by someone else.</div>
                    </div>
                </div>

                {/* Guest Login */}
                <div onClick={handleGuestLogin} className="card" style={{ padding: '20px', cursor: 'pointer', display: 'flex', gap: '16px', border: '1px solid rgba(255,255,255,0.8)', borderRadius: '20px', opacity: 0.8 }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '18px' }}>👤</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '800', fontSize: '15px', color: '#1e1b4b' }}>Guest Login</div>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>Local data storage only.</div>
                    </div>
                </div>
            </div>

            {/* Footer Branding */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🏏</span>
                <span className="text-gradient" style={{ fontWeight: '900', fontSize: '22px', letterSpacing: '-1px' }}>CricScorer Pro</span>
            </div>

            {/* Loading Overlay — centered full-screen */}
            {loading && (
                <div style={{
                    position: 'fixed', inset: 0,
                    zIndex: 9999,
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '20px',
                }}>
                    <div className="spinner" />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: '800', fontSize: '18px', color: '#1e1b4b', marginBottom: '6px' }}>{statusText}</div>
                        <div className="pulse-animation" style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Please wait a moment</div>
                    </div>
                </div>
            )}




            {showCodeInput && (
                <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', zIndex: 5000 }}>
                    <div className="modal-content animate-fade-in" style={{ padding: '32px' }}>
                        <h3 style={{ fontSize: '22px', fontWeight: '800', color: '#1e1b4b', marginBottom: '16px', textAlign: 'center' }}>Enter Profile Code</h3>
                        <input
                            placeholder="CODE1234"
                            maxLength={8}
                            value={code}
                            onPaste={handlePaste}
                            onChange={(e) => setCode(sanitizeInput(e.target.value).replace(/\s/g, '').toUpperCase().trim())}
                            className="premium-input"
                            style={{
                                width: '100%',
                                textAlign: 'center',
                                textTransform: 'uppercase',
                                fontSize: '26px',
                                fontWeight: '800',
                                letterSpacing: code.length > 8 ? '2px' : '6px',
                                marginBottom: '12px',
                                height: '60px'
                            }}
                        />

                        {recentCodes.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', textAlign: 'center' }}>Recent Codes</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {recentCodes.map(rc => (
                                        <button
                                            key={rc}
                                            onClick={() => handleLoginWithCode(rc)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '12px',
                                                backgroundColor: '#f1f5f9',
                                                border: '1px solid #e2e8f0',
                                                fontSize: '12px',
                                                fontWeight: '700',
                                                color: '#1e1b4b',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {rc}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="secondary" disabled={loading} onClick={() => setShowCodeInput(false)} style={{ flex: 1, height: '48px' }}>Cancel</button>
                            <button className="primary" disabled={loading} onClick={() => handleLoginWithCode()} style={{ flex: 1, height: '48px' }}>Login</button>
                        </div>
                        {error && <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', marginTop: '16px', textAlign: 'center' }}>{error}</p>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
