import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '../components/Header';

import { useMatch } from '../context/MatchContext';
import FeedbackModal from '../components/FeedbackModal';
import { signInWithGoogle, withTimeout, generateCode } from '../utils/authHelper';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

import { getMatchTimestamp } from '../utils/dataFetcher';
import { SPRING_PRESET, TAP_SCALE } from '../utils/animationPresets';
import useScrollRestore from '../hooks/useScrollRestore';
import { triggerHaptic } from '../utils/haptics';

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.05,
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: {
        opacity: 1,
        y: 0,
        transition: SPRING_PRESET
    }
};

const Home = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [showResume, setShowResume] = useState(state.matchStatus === 'live' || state.matchStatus === 'innings_break');
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncStatus, setSyncStatus] = useState('Initializing Sync...');
    const [recentMatches, setRecentMatches] = useState([]);
    const [loadingRecent, setLoadingRecent] = useState(false);

    // Pre-paint scroll restoration — no flicker
    useScrollRestore('home');

    // Dynamically calculate recent matches from localStorage
    useEffect(() => {
        const matchMap = new Map();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cricscorer_') && (key.includes('_match_') || key.startsWith('cricscorer_MATCH-'))) {
                try {
                    const m = JSON.parse(localStorage.getItem(key));
                    if (m && m.matchId && (!m.deleted && !m.deletedAt)) {
                        matchMap.set(m.matchId, m);
                    }
                } catch (e) {}
            }
        }

        try {
            const centralMatches = JSON.parse(localStorage.getItem('cricscorer_matches') || '[]');
            centralMatches.forEach(entry => {
                const m = entry.matchData || entry;
                if (m && m.matchId && (!m.deleted && !m.deletedAt)) {
                    if (!matchMap.has(m.matchId)) matchMap.set(m.matchId, m);
                }
            });
        } catch (e) {}

        const allMatches = Array.from(matchMap.values());

        if (allMatches.length > 0) {
            const summaries = allMatches
                .filter(m => m.innings && m.innings.length > 0)
                .sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a))
                .slice(0, 3)
                .map(m => ({
                    matchId: m.matchId,
                    team1: m.innings?.[0]?.battingTeam || m.team1?.name || '?',
                    team2: m.innings?.[1]?.battingTeam || m.innings?.[0]?.bowlingTeam || m.team2?.name || '?',
                    winner: m.winner || (m.matchStatus === 'live' ? 'Live' : 'Complete'),
                    runs: m.innings?.[0]?.runs ?? 0,
                    wickets: m.innings?.[0]?.wickets ?? 0,
                    overs: m.innings?.[0]?.overs ?? 0,
                }));
            
            setRecentMatches(summaries);
        } else {
            setRecentMatches([]);
        }
    }, [state.loginType, state.userCode, state.shareCode]);

    // Auto-sync: push local matches to cloud AND pull cloud matches to local
    useEffect(() => {
        if (state.loginType && state.loginType !== 'guest' && state.userCode) {
            import('../utils/dataFetcher').then(async (mod) => {
                try {
                    await mod.syncAllLocalMatchesToCloud();
                    await mod.forcePullFromCloud();
                } catch (e) {
                    console.warn('[Home] Auto-sync failed:', e);
                }
            });
        }
    }, [state.loginType, state.userCode]);

    const handleSyncToGoogle = async () => {
        triggerHaptic('medium');
        setSyncLoading(true);
        setSyncStatus('Connecting to Google...');
        try {
            const { openDB } = await import('idb');
            const user = await signInWithGoogle(setSyncStatus);
            if (!user) throw new Error("Google Login failed");

            if (setSyncStatus) setSyncStatus('Checking Remote Profile...');
            const userCodeRef = doc(db, 'userCodes', user.uid);
            const userCodeSnap = await withTimeout(getDoc(userCodeRef), 12000, "Firestore connection timed out");

            let userCode;
            let isNew = false;

            if (userCodeSnap.exists()) {
                userCode = userCodeSnap.data().code;
            } else {
                if (setSyncStatus) setSyncStatus('Generating New User Code...');
                userCode = generateCode();
                isNew = true;
                await withTimeout(setDoc(userCodeRef, {
                    code: userCode,
                    ownerName: user.displayName,
                    createdAt: new Date()
                }), 10000);
            }

            if (setSyncStatus) setSyncStatus('Updating Cloud Profile...');
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
                    await withTimeout(setDoc(shareLoginRef, { ...profileData, createdAt: new Date(), isLive: false, matches: [] }), 20000, "Failed to create Shareable Login in Firestore");
                } else {
                    await withTimeout(setDoc(shareLoginRef, profileData, { merge: true }), 20000, "Failed to update Shareable Login in Firestore");
                }
            } catch (writeErr) {
                console.warn("[Home] Firestore profile write warning:", writeErr);
                setDoc(shareLoginRef, profileData, { merge: true }).catch(e => console.error("[Home] Background setDoc error:", e));
            }

            if (setSyncStatus) setSyncStatus('Migrating Past Matches to Viewer Cloud...');
            let syncCount = 0;

            const localMatches = [];
            const prefixGoogle = `cricscorer_${user.uid}_match_`;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefixGoogle)) {
                    try {
                        const m = JSON.parse(localStorage.getItem(key));
                        if (m && m.matchId) localMatches.push(m);
                    } catch (e) { }
                }
            }

            try {
                const { openDB } = await import('idb');
                const idb = await openDB('CricScorerDB', 1);
                const guestMatches = await idb.getAll('matches');
                if (guestMatches.length > 0) {
                    guestMatches.forEach(gm => {
                        if (gm && gm.matchId && !localMatches.find(lm => lm.matchId === gm.matchId)) {
                            localMatches.push(gm);
                        }
                    });
                }
            } catch (e) { }

            for (const m of localMatches) {
                if (m.matchId) {
                    const mRef = doc(db, 'shareLogins', userCode, 'matches', m.matchId);
                    await setDoc(mRef, m, { merge: true }).catch(() => {});
                    syncCount++;
                }
            }

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

            const { clearMatchCache } = await import('../utils/dataFetcher');
            clearMatchCache();

            alert(`Backup Successful! Migrated ${syncCount} matches.`);

        } catch (err) {
            console.error("Sync to Google Failed:", err);
            const codeInfo = err.code ? ` (Code: ${err.code})` : '';
            alert(`Sync Warning: ${err.message || err.toString()}${codeInfo}`);
        } finally {
            setSyncLoading(false);
        }
    };

    const menuItems = [
        { label: 'Start New Match', icon: '🏏', color: '#10b981', path: '/new-match', sub: 'Setup match on the ground' },
        { label: 'Enter First Inning Score', icon: '📝', color: '#1e1b4b', path: '/manual-score', sub: 'Start 2nd inning' },
        { label: 'Tournaments', icon: '🏆', color: '#f59e0b', path: '/tournaments', sub: 'Create and manage tournaments' }
    ];

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
            <Header showLogout={true} />

            <motion.div
                className="container"
                variants={containerVariants}
                initial="hidden"
                animate="show"
                style={{ padding: '12px 16px 100px 16px' }}
            >

                {showResume && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)' }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            transition={SPRING_PRESET}
                            className="modal-content"
                            style={{ padding: '24px', borderRadius: '24px', maxWidth: '320px', textAlign: 'center', backgroundColor: 'white' }}
                        >
                            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏏</div>
                            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e1b4b', marginBottom: '8px' }}>Live Match Found</h3>
                            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '20px' }}>
                                You have a live match in progress: <br /><span style={{ color: '#4338ca', fontWeight: '800' }}>{state.team1?.name} vs {state.team2?.name}</span>
                            </p>
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                transition={SPRING_PRESET}
                                onClick={() => { triggerHaptic('light'); navigate('/live-scoring'); }}
                                style={{ width: '100%', height: '42px', padding: '0 16px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)', border: 'none', color: 'white', fontWeight: '800', marginBottom: '10px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(30,27,75,0.2)' }}
                            >
                                Resume Scoring
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => { triggerHaptic('light'); setShowResume(false); }}
                                style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: '#94a3b8', fontWeight: '700', fontSize: '12px', cursor: 'pointer' }}
                            >
                                Continue to Dashboard
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}

                {state.loginType === 'guest' && (
                    <motion.div
                        variants={itemVariants}
                        className="card"
                        style={{ padding: '0', overflow: 'hidden', marginBottom: '16px', background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)', color: 'white', border: 'none', boxShadow: '0 10px 25px rgba(30, 27, 75, 0.25)', borderRadius: '24px' }}
                    >
                        <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '22px', flexShrink: 0 }}>
                                ☁️
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.9, marginBottom: '2px' }}>Cloud Backup</div>
                                <div style={{ fontSize: '14px', fontWeight: '900', lineHeight: 1.2 }}>Save Matches to Google</div>
                                <div style={{ fontSize: '11px', fontWeight: '600', opacity: 0.8, marginTop: '2px' }}>Don't lose your stats on uninstall!</div>
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.94 }}
                                onClick={handleSyncToGoogle}
                                style={{ padding: '4px 16px', height: '32px', borderRadius: '10px', backgroundColor: 'white', color: '#1e1b4b', border: 'none', fontWeight: '800', fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                            >
                                Sync Now
                            </motion.button>
                        </div>
                    </motion.div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {menuItems.map((item, idx) => (
                        <motion.div
                            key={idx}
                            variants={itemVariants}
                            onClick={() => {
                                triggerHaptic('light');
                                navigate(item.path);
                            }}
                            whileTap={{ scale: 0.96, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                            whileHover={{ scale: 1.01 }}
                            transition={SPRING_PRESET}
                            className="card tap"
                            style={{
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 14px',
                                cursor: 'pointer',
                                background: 'white',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                                borderRadius: '16px'
                            }}
                        >
                            <div style={{
                                backgroundColor: item.color + '15',
                                width: '46px',
                                height: '46px',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                color: item.color,
                                flexShrink: 0
                            }}>
                                {item.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '900', fontSize: '16px', color: '#1e1b4b', marginBottom: '2px' }}>{item.label}</div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{item.sub}</div>
                            </div>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                backgroundColor: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#cbd5e1'
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Recent Matches Summary */}
                {loadingRecent && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', padding: '0 4px' }}>Loading Matches...</div>
                        {[1, 2].map(i => (
                            <div key={i} className="animate-pulse" style={{ padding: '10px 14px', background: 'white', borderRadius: '20px', marginBottom: '8px', height: '52px' }}></div>
                        ))}
                    </div>
                )}
                {!loadingRecent && recentMatches.length > 0 && (
                    <motion.div variants={itemVariants} style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Matches</div>
                            <div onClick={() => { triggerHaptic('light'); navigate('/history'); }} style={{ fontSize: '11px', fontWeight: '800', color: '#4338ca', cursor: 'pointer' }}>View All</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {recentMatches.map((s, i) => (
                                <motion.div
                                    key={i}
                                    variants={itemVariants}
                                    whileTap={{ scale: 0.96 }}
                                    transition={SPRING_PRESET}
                                    onClick={() => {
                                        triggerHaptic('light');
                                        navigate('/history');
                                    }}
                                    className="card"
                                    style={{ padding: '8px 14px', background: 'white', border: 'none', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', marginBottom: '0px', cursor: 'pointer' }}
                                >
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🏆</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '800', fontSize: '13px', color: '#1e1b4b' }}>{s.team1} vs {s.team2}</div>
                                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8' }}>
                                            {s.winner === 'Tie' ? 'Match Tied' : `${s.winner} won`} • {s.runs}/{s.wickets} ({s.overs})
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#4338ca', backgroundColor: '#f5f3ff', padding: '4px 8px', borderRadius: '8px' }}>
                                        SUMMARY
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Pro Tip Card with gentle looping shimmer / soft pulse on Wagon Wheel */}
                <motion.div
                    variants={itemVariants}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESET}
                    className="card"
                    style={{
                        marginTop: '16px',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '16px',
                        borderRadius: '24px',
                        color: 'white',
                        boxShadow: '0 10px 25px rgba(30,27,75,0.18)'
                    }}
                >
                    <div style={{ fontSize: '28px' }}>🎯</div>
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.7, marginBottom: '2px' }}>Pro Tip</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', lineHeight: 1.4 }}>
                            Track{' '}
                            <motion.span
                                animate={{
                                    scale: [1, 1.06, 1],
                                    color: ['#fbbf24', '#fef08a', '#fbbf24'],
                                    textShadow: [
                                        '0 0 0px rgba(251,191,36,0)',
                                        '0 0 10px rgba(251,191,36,0.6)',
                                        '0 0 0px rgba(251,191,36,0)'
                                    ]
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                                style={{ display: 'inline-block', fontWeight: '900' }}
                            >
                                Wagon Wheel
                            </motion.span>{' '}
                            for detailed insights into your scoring zones!
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    onClick={() => { triggerHaptic('light'); setIsFeedbackOpen(true); }}
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.01 }}
                    transition={SPRING_PRESET}
                    className="card"
                    style={{
                        marginTop: '20px',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: 'white',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                        borderRadius: '16px'
                    }}
                >
                    <div style={{
                        backgroundColor: '#ef444415',
                        width: '44px',
                        height: '44px',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        flexShrink: 0
                    }}>
                        🐛
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '900', fontSize: '15px', color: '#1e1b4b', marginBottom: '2px' }}>Report a Bug / Feedback</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>Help us improve the app</div>
                    </div>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#cbd5e1'
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </div>
                </motion.div>
            </motion.div>

            <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />

            {syncLoading && (
                <div className="modal-overlay" style={{ zIndex: 10002, background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTopColor: '#4338ca', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
                        <div style={{ fontWeight: '800', fontSize: '18px', color: '#1e1b4b', marginBottom: '4px' }}>{syncStatus}</div>
                        <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>Please wait, migrating data to Cloud...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
