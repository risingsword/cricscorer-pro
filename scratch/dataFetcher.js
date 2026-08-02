import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { openDB } from 'idb';

let matchCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds cache
// --- Tombstone Soft-Delete Pattern ---
// Matches with deleted:true are tombstones — deletion signals across all devices.
// When detected during sync, local copies are purged automatically.
const separateTombstones = (matches, userScope) => {
    const active = [];
    const deletedIds = new Set();
    let purged = 0;
    
    // First pass: identify all tombstoned match IDs
    for (const m of matches) {
        if (m && m.matchId && m.deleted === true) {
            deletedIds.add(m.matchId);
            // Also ensure it is permanently tracked locally
            if (typeof window !== 'undefined') {
                try {
                    const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
                    if (!persistentDeleted.includes(m.matchId)) {
                        persistentDeleted.push(m.matchId);
                        localStorage.setItem('deleted_matches', JSON.stringify(persistentDeleted));
                    }
                } catch(e) {}
            }
        }
    }

    // Second pass: filter out ANY match that corresponds to a tombstoned ID
    for (const m of matches) {
        if (!m || !m.matchId) continue;
        if (deletedIds.has(m.matchId)) {
            if (userScope) {
                localStorage.removeItem(`cricscorer_${userScope}_match_${m.matchId}`);
            }
            purged++;
        } else {
            // Extra check to ensure we only push unique copies if somehow duplicated, but Set/Map later handles it
            active.push(m);
        }
    }
    
    if (purged > 0) console.log(`[Tombstone] Purged ${purged} instances of deleted matches locally`);
    return active;
};

// Retry wrapper for Firestore reads - prevents silent failures
const withRetry = async (fn, retries = 2, delay = 1000) => {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, delay));
        }
    }
};

export const fetchAllMatches = async (forceRefresh = false, onRemoteData = null) => {
    try {
        const now = Date.now();
        if (!forceRefresh && matchCache && (now - lastFetchTime < CACHE_DURATION)) {
            if (onRemoteData) onRemoteData(matchCache);
            return matchCache;
        }

        const sessionStr = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
        const session = sessionStr ? JSON.parse(sessionStr) : {};
        const firebaseUid = auth.currentUser?.uid || (session.loginType === 'google' ? session.userCode : null);

        const loginType = session.loginType || 'guest';
        const userScope = loginType === 'guest' ? 'guest' : (session.userCode || session.matchId || 'guest');

        // ==========================================
        // 1. FAST LOCAL LOAD (Returns immediately)
        // ==========================================
        const localMatches = [];
        const prefix = `cricscorer_${userScope}_match_`;
        const oldKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(prefix)) {
                try {
                    const m = JSON.parse(localStorage.getItem(key));
                    if (m && m.matchId) localMatches.push(m);
                } catch (e) { }
            }
            // Detect old-format keys from before the guest scope fix
            if (loginType === 'guest' && key.startsWith('cricscorer_MATCH-') && key.includes('_match_')) {
                oldKeysToRemove.push(key);
            }
        }
        
        // Migrate old-format keys
        oldKeysToRemove.forEach(oldKey => {
            try {
                const m = JSON.parse(localStorage.getItem(oldKey));
                if (m && m.matchId) {
                    const newKey = `cricscorer_guest_match_${m.matchId}`;
                    const existing = localStorage.getItem(newKey);
                    if (!existing) {
                        localStorage.setItem(newKey, JSON.stringify(m));
                        localMatches.push(m);
                    }
                }
                localStorage.removeItem(oldKey);
            } catch (e) { }
        });

        let localDeleted = [];
        try { 
            const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            localDeleted = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
        } catch(e){}

        const localMatchMap = new Map();
        localMatches.forEach(m => {
            if (m.matchId && m.deleted !== true && !localDeleted.includes(m.matchId)) {
                localMatchMap.set(m.matchId, m);
            }
        });

        // Add IDB Matches for guest
        if (loginType === 'guest') {
            try {
                const idb = await openDB('CricScorerDB', 1);
                const idbMatches = await idb.getAll('matches');
                idbMatches.forEach(m => {
                    if (!m.matchId || m.deleted === true || localDeleted.includes(m.matchId)) return;
                    localMatchMap.set(m.matchId, m);
                });
            } catch(e) {}
        }

        const initialResults = Array.from(localMatchMap.values());
        
        // Return local data immediately to render the UI super fast!
        if (onRemoteData) {
            onRemoteData(initialResults);
        }

        // ==========================================
        // 2. BACKGROUND FETCH FROM FIRESTORE
        // ==========================================
        let fetchedMatches = [];
        if (loginType !== 'guest') {
            let matchesColRef = null;
            let singleDocRef = null;
            const tasks = [];

            if (loginType === 'shareable') {
                if (session.userCode) {
                    matchesColRef = collection(db, 'shareLogins', session.userCode, 'matches');
                    singleDocRef = doc(db, 'shareLogins', session.userCode);
                }
            } else if (loginType === 'code') {
                const viewingCode = session.viewingCode || session.userCode;
                if (viewingCode) {
                    matchesColRef = collection(db, 'shareLogins', viewingCode, 'matches');
                    singleDocRef = doc(db, 'shareLogins', viewingCode);
                }
            } else if (loginType === 'google') {
                const uid = firebaseUid; 
                if (uid) {
                    matchesColRef = collection(db, 'googleUsers', uid, 'matches');
                    singleDocRef = doc(db, 'googleUsers', uid);
                    try {
                        const codeSnap = await getDoc(doc(db, 'userCodes', uid));
                        if (codeSnap.exists() && codeSnap.data()?.code) {
                            const code = codeSnap.data().code;
                            tasks.push(
                                withRetry(() => getDocs(collection(db, 'shareLogins', code, 'matches')).then(snap => snap.docs.map(d => d.data())))
                                    .catch(() => [])
                            );
                        }
                    } catch(e) {}
                }
            }

            if (matchesColRef) tasks.push(
                withRetry(() => getDocs(matchesColRef).then(snap => snap.docs.map(d => d.data())))
                    .catch(() => [])
            );
            if (singleDocRef) tasks.push(
                withRetry(() => getDoc(singleDocRef).then(snap => {
                    if (!snap.exists()) return [];
                    const data = snap.data();
                    const ms = (data.matches && Array.isArray(data.matches)) ? data.matches : [];
                    if (ms.length === 0 && data.currentMatch) return [data.currentMatch];
                    return ms;
                }))
                    .catch(() => [])
            );

            const results = await Promise.all(tasks);
            fetchedMatches = separateTombstones(results.flat(), userScope);
        }

        // Merge logic
        const matchMap = new Map();
        const matchesToSyncMap = new Map();
        
        localMatches.forEach(m => {
            if (m.matchId && m.deleted !== true && !localDeleted.includes(m.matchId)) {
                matchMap.set(m.matchId, m);
                matchesToSyncMap.set(m.matchId, m);
            }
        });

        fetchedMatches.forEach(m => {
            if (!m.matchId || m.deleted === true || localDeleted.includes(m.matchId)) return;
            const existing = matchMap.get(m.matchId);
            if (!existing) {
                matchMap.set(m.matchId, m);
            } else {
                const serverBalls = m.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                const localBalls = existing.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                if (serverBalls > localBalls) {
                    matchMap.set(m.matchId, m);
                    matchesToSyncMap.delete(m.matchId);
                } else if (serverBalls === localBalls) {
                    const serverTime = m.lastUpdated || (m.startTime || 0);
                    const localTime = existing.lastUpdated || (existing.startTime || 0);
                    if (serverTime > localTime) {
                        matchMap.set(m.matchId, m);
                        matchesToSyncMap.delete(m.matchId);
                    } else if (serverTime === localTime) {
                        matchesToSyncMap.delete(m.matchId);
                    }
                }
            }
        });

        const finalResults = Array.from(matchMap.values());
        matchCache = finalResults;
        lastFetchTime = Date.now();

        if (onRemoteData && loginType !== 'guest') {
            onRemoteData(finalResults);
        }

        // BACKGROUND SYNC
        if (loginType !== 'guest') {
            const matchesToSync = Array.from(matchesToSyncMap.values()).filter(m => m.matchId && m.innings);
            if (matchesToSync.length > 0) {
                (async () => {
                    try {
                        const { doc: fbDoc, setDoc: fbSetDoc, getDoc: fbGetDoc } = await import('firebase/firestore');
                        let userCodeForGoogle = null;
                        if (loginType === 'google' && firebaseUid) {
                            try {
                                const codeSnap = await fbGetDoc(fbDoc(db, 'userCodes', firebaseUid));
                                if (codeSnap.exists() && codeSnap.data()?.code) {
                                    userCodeForGoogle = codeSnap.data().code;
                                }
                            } catch(e) {}
                        }

                        for (const m of matchesToSync) {
                            const { history, ...rawClean } = m;
                            const clean = {
                                ...rawClean,
                                innings: (rawClean.innings || []).map(inn => ({
                                    ...inn,
                                    batsmen: (inn.batsmen || []).map(({ wagonData, ...b }) => b)
                                }))
                            };
                            clean.deleted = false;
                            clean.lastUpdated = Date.now();
                            let matchDocRef1, matchDocRef2;
                            if ((loginType === 'shareable' || loginType === 'code') && userScope) {
                                matchDocRef1 = fbDoc(db, 'shareLogins', userScope, 'matches', m.matchId);
                            } else if (loginType === 'google' && firebaseUid) {
                                matchDocRef1 = fbDoc(db, 'googleUsers', firebaseUid, 'matches', m.matchId);
                                if (userCodeForGoogle) {
                                    matchDocRef2 = fbDoc(db, 'shareLogins', userCodeForGoogle, 'matches', m.matchId);
                                }
                            }
                            if (matchDocRef1) await fbSetDoc(matchDocRef1, clean);
                            if (matchDocRef2) await fbSetDoc(matchDocRef2, clean);
                        }
                    } catch (e) {}
                })();
            }
        }

        return finalResults;
    } catch (e) {
        console.error("Failed to fetch matches:", e);
        return matchCache || [];
    }
};
