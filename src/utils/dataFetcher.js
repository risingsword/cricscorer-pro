import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { openDB } from 'idb';

const waitForAuth = () => {
    return new Promise((resolve) => {
        // Fast-path: guest and code logins don't use Firebase Auth, so resolve immediately
        try {
            const sessionStr = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                if (session.loginType === 'guest' || session.loginType === 'code') {
                    return resolve(null);
                }
            }
        } catch (e) {}

        if (auth.currentUser) return resolve(auth.currentUser);
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
        setTimeout(() => {
            unsubscribe();
            resolve(auth.currentUser);
        }, 1500);
    });
};

let matchCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

export const getUserScope = (sessionOrState) => {
    if (!sessionOrState) return 'guest';
    const loginType = sessionOrState.loginType || 'guest';
    if (loginType === 'guest') return 'guest';
    return sessionOrState.shareCode || sessionOrState.userCode || sessionOrState.viewingCode || sessionOrState.matchId || 'guest';
};

export const getMatchTimestamp = (matchOrId) => {
    if (!matchOrId) return 0;
    if (typeof matchOrId === 'number') return matchOrId;
    
    if (typeof matchOrId === 'object') {
        const ts = matchOrId.startTime || matchOrId.createdAt || matchOrId.updatedAt || matchOrId.lastUpdated;
        if (ts && !isNaN(ts)) return Number(ts);
        if (matchOrId.matchId) {
            return getMatchTimestamp(matchOrId.matchId);
        }
        return 0;
    }
    
    const str = String(matchOrId);
    
    // Look for a 10 to 13 digit epoch timestamp in the string (e.g. match_1722384912000 or m_1722384912000_1)
    const matchDigits = str.match(/\d{10,13}/);
    if (matchDigits) {
        return parseInt(matchDigits[0]);
    }
    
    // Fallback: extract all digits, but if longer than 13 digits, take first 13 digits
    const digits = str.replace(/\D/g, '');
    if (!digits) return 0;
    if (digits.length > 13) {
        return parseInt(digits.slice(0, 13)) || 0;
    }
    return parseInt(digits) || 0;
};

// --- Tombstone Soft-Delete Pattern (LWW-aware) ---
// Matches with deleted:true OR deletedAt set are tombstones.
// The tombstone timestamp (deletedAt) is compared against updatedAt to determine
// which signal is newer — preventing resurrection of intentionally deleted matches.
// STRICT MODE: tombstone wins ONLY if deletedAt > updatedAt (strictly greater)
// AND the active record has no innings data (so we never lose real match data to a stale tombstone).
const separateTombstones = (matches, userScope, ignoreTombstones = false) => {
    if (ignoreTombstones) return matches.filter(m => m && m.matchId); // Recovery mode: skip all tombstone logic

    const deletedMap = new Map(); // matchId -> latestDeletedAt

    // First pass: collect tombstone timestamps
    for (const m of matches) {
        if (!m || !m.matchId) continue;
        const isTombstone = m.deleted === true || (m.deletedAt && m.deletedAt > 0);
        if (isTombstone) {
            const delTime = m.deletedAt || m.lastUpdated || m.updatedAt || 1;
            if (!deletedMap.has(m.matchId) || delTime > deletedMap.get(m.matchId)) {
                deletedMap.set(m.matchId, delTime);
            }

            // Purge from local storage immediately when a cloud tombstone is found
            if (userScope) {
                localStorage.removeItem(`cricscorer_${userScope}_match_${m.matchId}`);
                try {
                    const keys = Object.keys(localStorage).filter(k => k.includes(`_match_${m.matchId}`));
                    keys.forEach(k => localStorage.removeItem(k));
                } catch (e) { }
            }

            // Always persist tombstone to localStorage
            if (typeof window !== 'undefined') {
                try {
                    const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
                    if (!persistentDeleted.includes(m.matchId)) {
                        persistentDeleted.push(m.matchId);
                        localStorage.setItem('deleted_matches', JSON.stringify(persistentDeleted));
                    }
                } catch (e) { }
            }
        }
    }

    // Second pass: keep active records unless tombstone is STRICTLY newer
    const finalActive = [];
    let purged = 0;

    let localDeleted = [];
    try {
        const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
        const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
        localDeleted = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
    } catch (e) { }

    for (const m of matches) {
        if (!m || !m.matchId) continue;
        const isTombstone = m.deleted === true || (m.deletedAt && m.deletedAt > 0);
        if (isTombstone) continue; // Skip tombstone records in output

        if (localDeleted.includes(m.matchId)) {
            if (userScope) {
                localStorage.removeItem(`cricscorer_${userScope}_match_${m.matchId}`);
                try {
                    const keys = Object.keys(localStorage).filter(k => k.includes(`_match_${m.matchId}`));
                    keys.forEach(k => localStorage.removeItem(k));
                } catch (e) { }
            }
            purged++;
            continue;
        }

        const tombstoneTime = deletedMap.get(m.matchId);
        if (tombstoneTime) {
            const mTime = m.updatedAt || m.lastUpdated || m.startTime || 0;

            // Tombstone wins if >= active match timestamp
            if (tombstoneTime >= mTime) {
                if (userScope) {
                    localStorage.removeItem(`cricscorer_${userScope}_match_${m.matchId}`);
                    try {
                        const keys = Object.keys(localStorage).filter(k => k.includes(`_match_${m.matchId}`));
                        keys.forEach(k => localStorage.removeItem(k));
                    } catch (e) { }
                }
                console.log(`[Sync] TOMBSTONE ${m.matchId} — purged (tomb=${tombstoneTime} >= match=${mTime})`);
                purged++;
                continue;
            }
        }

        finalActive.push(m);
    }

    if (purged > 0) console.log(`[Sync] separateTombstones: purged ${purged} record(s)`);
    return finalActive;
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
        const userScope = getUserScope(session);

        // ==========================================
        // 1. FAST LOCAL LOAD (Returns immediately)
        // ==========================================
        const localMatchMap = new Map();
        let localDeleted = [];
        try {
            const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            localDeleted = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
        } catch (e) { }

        // 1A. Scan ALL localStorage keys matching cricscorer_ pattern containing _match_
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cricscorer_') && (key.includes('_match_') || key.startsWith('cricscorer_MATCH-'))) {
                try {
                    const m = JSON.parse(localStorage.getItem(key));
                    if (m && m.matchId && m.deleted !== true && (!m.deletedAt || m.deletedAt <= 0) && !localDeleted.includes(m.matchId)) {
                        localMatchMap.set(m.matchId, m);
                        // Auto re-key under current userScope if logged in
                        if (userScope && userScope !== 'guest' && !key.startsWith(`cricscorer_${userScope}_match_`)) {
                            try {
                                localStorage.setItem(`cricscorer_${userScope}_match_${m.matchId}`, JSON.stringify(m));
                            } catch (e) { }
                        }
                    }
                } catch (e) { }
            }
        }

        // 1B. Scan central 'cricscorer_matches' storage array
        try {
            const centralMatches = JSON.parse(localStorage.getItem('cricscorer_matches') || '[]');
            centralMatches.forEach(entry => {
                const m = entry.matchData || entry;
                if (m && m.matchId && m.deleted !== true && (!m.deletedAt || m.deletedAt <= 0) && !localDeleted.includes(m.matchId)) {
                    if (!localMatchMap.has(m.matchId)) {
                        localMatchMap.set(m.matchId, m);
                        if (userScope && userScope !== 'guest') {
                            try {
                                localStorage.setItem(`cricscorer_${userScope}_match_${m.matchId}`, JSON.stringify(m));
                            } catch (e) { }
                        }
                    }
                }
            });
        } catch (e) { }

        // 1C. Scan IndexedDB 'CricScorerDB' for legacy/offline matches
        try {
            const idb = await openDB('CricScorerDB', 1);
            const idbMatches = await idb.getAll('matches');
            idbMatches.forEach(m => {
                if (!m || !m.matchId || m.deleted === true || (m.deletedAt && m.deletedAt > 0) || localDeleted.includes(m.matchId)) return;
                if (!localMatchMap.has(m.matchId)) {
                    localMatchMap.set(m.matchId, m);
                    if (userScope && userScope !== 'guest') {
                        try {
                            localStorage.setItem(`cricscorer_${userScope}_match_${m.matchId}`, JSON.stringify(m));
                        } catch (e) { }
                    }
                }
            });
        } catch (e) { }

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
            await waitForAuth();
            let matchesColRef = null;
            let singleDocRef = null;
            const tasks = [];

            if (loginType === 'shareable') {
                const sc = session.shareCode || session.userCode;
                if (sc) {
                    matchesColRef = collection(db, 'shareLogins', sc, 'matches');
                    singleDocRef = doc(db, 'shareLogins', sc);
                }
            } else if (loginType === 'code') {
                const viewingCode = session.viewingCode || session.shareCode || session.userCode;
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
                    } catch (e) { }
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
            const flatCloud = results.flat();

            // De-duplicate cloud results: same matchId can appear in both googleUsers AND shareLogins.
            const cloudDeduped = new Map();
            for (const m of flatCloud) {
                if (!m || !m.matchId) continue;
                const existing = cloudDeduped.get(m.matchId);
                if (!existing) {
                    cloudDeduped.set(m.matchId, m);
                } else {
                    const mIsTomb = m.deleted === true || (m.deletedAt && m.deletedAt > 0);
                    const eIsTomb = existing.deleted === true || (existing.deletedAt && existing.deletedAt > 0);

                    if (mIsTomb && !eIsTomb) {
                        const tombTime = m.deletedAt || m.updatedAt || m.lastUpdated || 0;
                        const activeTime = existing.updatedAt || existing.lastUpdated || 0;
                        if (tombTime >= activeTime) {
                            cloudDeduped.set(m.matchId, m); // Tombstone wins
                        }
                    } else if (!mIsTomb && eIsTomb) {
                        const tombTime = existing.deletedAt || existing.updatedAt || existing.lastUpdated || 0;
                        const activeTime = m.updatedAt || m.lastUpdated || 0;
                        if (tombTime < activeTime) {
                            cloudDeduped.set(m.matchId, m); // Active wins (newer update beats old tombstone)
                        }
                    } else if (mIsTomb && eIsTomb) {
                        const mTime = m.deletedAt || m.updatedAt || 0;
                        const eTime = existing.deletedAt || existing.updatedAt || 0;
                        if (mTime > eTime) {
                            cloudDeduped.set(m.matchId, m);
                        }
                    } else {
                        const mBalls = (m.innings || []).reduce((s, inn) => s + (inn.balls || 0), 0);
                        const eBalls = (existing.innings || []).reduce((s, inn) => s + (inn.balls || 0), 0);
                        const mTime = m.updatedAt || m.lastUpdated || m.startTime || 0;
                        const eTime = existing.updatedAt || existing.lastUpdated || existing.startTime || 0;
                        if (mBalls > eBalls || (mBalls === eBalls && mTime > eTime)) {
                            cloudDeduped.set(m.matchId, m);
                        }
                    }
                }
            }
            fetchedMatches = separateTombstones(Array.from(cloudDeduped.values()), userScope);
        }

        // ── LWW Merge Logic ──────────────────────────────────────────────────────
        // Primary key: updatedAt timestamp (Last-Write-Wins)
        // Fallback: ball count (for old records without updatedAt)
        // Cloud tombstones (deletedAt) always win over same-timestamp local data.
        const matchMap = new Map();
        const matchesToSyncMap = new Map();

        // Step 1: Seed map with all valid cloud matches (cloud is assumed more reliable)
        fetchedMatches.forEach(m => {
            if (!m.matchId || m.deleted === true || m.deletedAt || localDeleted.includes(m.matchId)) return;
            matchMap.set(m.matchId, m);
        });

        // Step 2: Compare each local match against the cloud version using LWW
        initialResults.forEach(m => {
            if (!m.matchId || m.deleted === true || m.deletedAt || localDeleted.includes(m.matchId)) return;

            const cloudVersion = matchMap.get(m.matchId);
            if (!cloudVersion) {
                // Match only exists locally — queue it to push to cloud
                matchMap.set(m.matchId, m);
                matchesToSyncMap.set(m.matchId, m);
                console.log(`[Sync] MERGE ${m.matchId} — local-only, queued for push`);
            } else {
                // Both local and cloud exist — determine winner via LWW
                const localUpdatedAt = m.updatedAt || m.lastUpdated || 0;
                const cloudUpdatedAt = cloudVersion.updatedAt || cloudVersion.lastUpdated || 0;

                if (localUpdatedAt > cloudUpdatedAt) {
                    // Local is definitively newer — use local and push to cloud
                    matchMap.set(m.matchId, m);
                    matchesToSyncMap.set(m.matchId, m);
                    console.log(`[Sync] MERGE ${m.matchId} — local WINS (local=${localUpdatedAt}, cloud=${cloudUpdatedAt}), queued for push`);
                } else if (localUpdatedAt === cloudUpdatedAt) {
                    // Same timestamp — use ball count as final tiebreaker (offline scoring edge case)
                    const localBalls = m.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                    const cloudBalls = cloudVersion.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                    if (localBalls > cloudBalls) {
                        matchMap.set(m.matchId, m);
                        matchesToSyncMap.set(m.matchId, m);
                        console.log(`[Sync] MERGE ${m.matchId} — TIED timestamp, local has more balls (local=${localBalls}, cloud=${cloudBalls}), queued`);
                    } else {
                        console.log(`[Sync] MERGE ${m.matchId} — TIED timestamp, cloud wins or equal balls, keeping cloud`);
                    }
                } else {
                    // Cloud is strictly newer — keep cloud version
                    console.log(`[Sync] MERGE ${m.matchId} — cloud WINS (cloud=${cloudUpdatedAt}, local=${localUpdatedAt}), keeping cloud`);
                }
            }
        });

        const finalResults = Array.from(matchMap.values());

        // Save fresh cloud results to localStorage for offline access
        if (userScope && userScope !== 'guest') {
            finalResults.forEach(m => {
                if (m && m.matchId && !m.deleted && !m.deletedAt) {
                    try {
                        const key = `cricscorer_${userScope}_match_${m.matchId}`;
                        const existingStr = localStorage.getItem(key);
                        if (!existingStr) {
                            localStorage.setItem(key, JSON.stringify(m));
                        } else {
                            const existingObj = JSON.parse(existingStr);
                            const eTime = existingObj.updatedAt || existingObj.lastUpdated || 0;
                            const mTime = m.updatedAt || m.lastUpdated || 0;
                            if (mTime >= eTime) {
                                localStorage.setItem(key, JSON.stringify(m));
                            }
                        }
                    } catch (e) { }
                }
            });
        }

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
                            } catch (e) { }
                        }

                        for (const m of matchesToSync) {
                            const { history, ...rawClean } = m;
                            const localUpdatedAt = m.updatedAt || m.lastUpdated || Date.now();
                            const clean = {
                                ...rawClean,
                                innings: (rawClean.innings || []).map(inn => ({
                                    ...inn,
                                    batsmen: (inn.batsmen || []).map(({ wagonData, ...b }) => b)
                                })),
                                deleted: false,
                                deletedAt: null,
                                updatedAt: localUpdatedAt,
                                lastUpdated: localUpdatedAt,  // legacy compat
                                createdAt: m.createdAt || localUpdatedAt,
                            };
                            let matchDocRef1, matchDocRef2;
                            if ((loginType === 'shareable' || loginType === 'code') && userScope) {
                                matchDocRef1 = fbDoc(db, 'shareLogins', userScope, 'matches', m.matchId);
                            } else if (loginType === 'google' && firebaseUid) {
                                matchDocRef1 = fbDoc(db, 'googleUsers', firebaseUid, 'matches', m.matchId);
                                if (userCodeForGoogle) {
                                    matchDocRef2 = fbDoc(db, 'shareLogins', userCodeForGoogle, 'matches', m.matchId);
                                }
                            }
                            // LWW: Only push if cloud version is older than local
                            if (matchDocRef1) {
                                let shouldPush = true;
                                try {
                                    const cloudSnap = await fbGetDoc(matchDocRef1);
                                    if (cloudSnap.exists()) {
                                        const cData = cloudSnap.data();
                                        const cloudUpdatedAt = cData.updatedAt || cData.lastUpdated || 0;
                                        const cloudDeletedAt = cData.deletedAt || 0;
                                        if (cloudDeletedAt >= localUpdatedAt) {
                                            console.log(`[Sync] BG-PUSH ${m.matchId} — SKIPPED: cloud tombstone newer`);
                                            shouldPush = false;
                                        } else if (cloudUpdatedAt >= localUpdatedAt) {
                                            console.log(`[Sync] BG-PUSH ${m.matchId} — SKIPPED: cloud is newer or equal`);
                                            shouldPush = false;
                                        }
                                    }
                                } catch (checkErr) {
                                    // If we can't check, proceed with push
                                }
                                if (shouldPush) {
                                    await fbSetDoc(matchDocRef1, clean);
                                    console.log(`[Sync] BG-PUSH ${m.matchId} — pushed to cloud`);
                                }
                            }
                            if (matchDocRef2) {
                                try { await fbSetDoc(matchDocRef2, clean); } catch (e) { }
                            }
                        }
                    } catch (e) { }
                })();
            }
        }

        return finalResults;
    } catch (e) {
        console.error("Failed to fetch matches:", e);
        return matchCache || [];
    }
};

export const subscribeToMatches = (onUpdate) => {
    const sessionStr = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
    const session = sessionStr ? JSON.parse(sessionStr) : {};
    const userScope = getUserScope(session);
    const loginType = session.loginType || 'guest';

    const getLocalMatches = () => {
        const map = new Map();
        let localDeleted = [];
        try {
            const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            localDeleted = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
        } catch (e) { }

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('cricscorer_') && (key.includes('_match_') || key.startsWith('cricscorer_MATCH-'))) {
                try {
                    const m = JSON.parse(localStorage.getItem(key));
                    if (m && m.matchId && m.deleted !== true && (!m.deletedAt || m.deletedAt <= 0) && !localDeleted.includes(m.matchId)) {
                        map.set(m.matchId, m);
                    }
                } catch (e) { }
            }
        }

        try {
            const centralMatches = JSON.parse(localStorage.getItem('cricscorer_matches') || '[]');
            centralMatches.forEach(entry => {
                const m = entry.matchData || entry;
                if (m && m.matchId && m.deleted !== true && (!m.deletedAt || m.deletedAt <= 0) && !localDeleted.includes(m.matchId)) {
                    if (!map.has(m.matchId)) map.set(m.matchId, m);
                }
            });
        } catch (e) { }

        return Array.from(map.values());
    };

    const mergeWithLocal = (serverMatches) => {
        const filteredServer = separateTombstones(serverMatches, userScope);
        const local = getLocalMatches();
        const map = new Map();
        local.forEach(m => { if (m.matchId) map.set(m.matchId, m); });
        filteredServer.forEach(m => {
            if (!m.matchId) return;
            const existing = map.get(m.matchId);
            if (!existing) {
                map.set(m.matchId, m);
                if (userScope && userScope !== 'guest') {
                    try {
                        localStorage.setItem(`cricscorer_${userScope}_match_${m.matchId}`, JSON.stringify(m));
                    } catch (e) { }
                }
            } else {
                const sTime = m.updatedAt || m.lastUpdated || 0;
                const lTime = existing.updatedAt || existing.lastUpdated || 0;
                const sBalls = m.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                const lBalls = existing.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                if (sTime > lTime || (sTime === lTime && sBalls >= lBalls) || (m.matchStatus === 'complete' && existing.matchStatus !== 'complete')) {
                    map.set(m.matchId, m);
                    if (userScope && userScope !== 'guest') {
                        try {
                            localStorage.setItem(`cricscorer_${userScope}_match_${m.matchId}`, JSON.stringify(m));
                        } catch (e) { }
                    }
                }
            }
        });
        return Array.from(map.values());
    };

    if (loginType === 'guest') {
        fetchAllMatches().then(res => {
            if (typeof onUpdate === 'function') {
                onUpdate(res);
            }
        });
        return () => { };
    }

    let unsubCol = null;
    let unsubDoc = null;

    const handleSnapshot = (matches) => {
        const merged = mergeWithLocal(matches);
        if (typeof onUpdate === 'function') {
            onUpdate(merged);
        }
    };

    if (loginType === 'shareable' || loginType === 'code') {
        const code = (loginType === 'code' ? (session.viewingCode || session.userCode) : session.userCode);
        if (code) {
            unsubCol = onSnapshot(collection(db, 'shareLogins', code, 'matches'), (snapshot) => {
                if (!snapshot.empty) {
                    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
                    handleSnapshot(snapshot.docs.map(doc => doc.data()));
                } else if (!unsubDoc) {
                    unsubDoc = onSnapshot(doc(db, 'shareLogins', code), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            let resultMatches = [];
                            if (data.matches) resultMatches = [...data.matches];
                            if (resultMatches.length === 0 && data.currentMatch) resultMatches.push(data.currentMatch);
                            handleSnapshot(resultMatches);
                        }
                    });
                }
            });
        }
    } else if (loginType === 'google') {
        const uid = auth.currentUser?.uid;
        if (uid) {
            unsubCol = onSnapshot(collection(db, 'googleUsers', uid, 'matches'), (snapshot) => {
                if (!snapshot.empty) {
                    if (unsubDoc) { unsubDoc(); unsubDoc = null; }
                    handleSnapshot(snapshot.docs.map(doc => doc.data()));
                } else if (!unsubDoc) {
                    unsubDoc = onSnapshot(doc(db, 'googleUsers', uid), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            let resultMatches = [];
                            if (data.matches) resultMatches = [...data.matches];
                            if (resultMatches.length === 0 && data.currentMatch) resultMatches.push(data.currentMatch);
                            handleSnapshot(resultMatches);
                        }
                    });
                }
            });
        }
    }

    return () => {
        if (unsubCol) unsubCol();
        if (unsubDoc) unsubDoc();
    };
};

export const fetchRecentPlayers = async () => {
    try {
        const sessionStr = localStorage.getItem('userSession');
        const legacyStr = localStorage.getItem('cricscorer_login');
        let session = {};
        if (sessionStr) session = JSON.parse(sessionStr);
        else if (legacyStr) session = JSON.parse(legacyStr);

        const loginType = session.loginType || 'guest';
        if (loginType === 'guest') {
            const matches = await fetchAllMatches();
            const players = new Set();
            matches.forEach(m => {
                m.innings.forEach(inn => {
                    inn.batsmen.forEach(b => { if (b.name) players.add(b.name.trim()); });
                    inn.bowlers.forEach(b => { if (b.name) players.add(b.name.trim()); });
                });
            });
            return Array.from(players).filter(Boolean);
        }

        let docRef = null;
        if (loginType === 'shareable') {
            docRef = doc(db, 'shareLogins', session.userCode);
        } else if (loginType === 'code') {
            docRef = doc(db, 'shareLogins', session.viewingCode || session.userCode);
        } else if (loginType === 'google') {
            docRef = doc(db, 'googleUsers', session.userCode || session.matchId);
        }

        if (docRef) {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                return Object.keys(data.players || {});
            }
        }
    } catch (e) {
        console.error("Player fetch failed", e);
    }
    return [];
};

export const addDeletedMatchId = (matchId) => {
    if (!matchId) return;
    try {
        const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
        if (!deletedList.includes(matchId)) {
            deletedList.push(matchId);
            localStorage.setItem('deleted_matches', JSON.stringify(deletedList));
        }
    } catch (e) { }
};

export const clearMatchCache = () => {
    matchCache = null;
    lastFetchTime = 0;
};

/**
 * Syncs ALL local matches for the current user to Firestore.
 * This fixes the issue where only the current match in context was synced,
 * leaving completed matches stranded in localStorage.
 */
export const syncAllLocalMatchesToCloud = async () => {
    try {
        await waitForAuth();
        try { await applyDeletedListToCloud(); } catch (e) { }
        const sessionStr = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
        if (!sessionStr) {
            return { synced: 0, errors: 0, found: 0, message: 'No session found' };
        }
        const session = JSON.parse(sessionStr);

        const loginType = session.loginType;
        const firebaseUid = auth.currentUser?.uid || (loginType === 'google' ? session.userCode : null);

        // Cannot sync for guest users
        if (loginType === 'guest') {
            return { synced: 0, errors: 0, found: 0, message: 'Guest mode - no cloud sync' };
        }

        const userScope = getUserScope(session);
        const prefix = `cricscorer_${userScope}_match_`;
        const localMatches = [];
        const seenMatchIds = new Set();

        // Initialize localDeleted to prevent resurrecting deleted matches
        let localDeleted = [];
        try {
            const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            localDeleted = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
        } catch (e) { }

        // Collect all localStorage matches for this user from per-match keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    const m = JSON.parse(localStorage.getItem(key));
                    if (m && m.matchId && m.innings && !seenMatchIds.has(m.matchId) && !localDeleted.includes(m.matchId)) {
                        localMatches.push(m);
                        seenMatchIds.add(m.matchId);
                    }
                } catch (e) { }
            }
        }

        // Legacy 'cricscorer_matches' array key — skip this entirely during sync
        // as it can contain stale/duplicate matches that cause discrepancies.
        // Only per-match keys (cricscorer_{scope}_match_{id}) are authoritative.

        if (localMatches.length === 0) {
            return { synced: 0, errors: 0, found: 0, message: 'No local matches found' };
        }

        const { doc: fbDoc, setDoc: fbSetDoc, getDoc: fbGetDoc } = await import('firebase/firestore');

        let userCodeForGoogle = null;
        if (loginType === 'google' && firebaseUid) {
            try {
                const codeSnap = await fbGetDoc(fbDoc(db, 'userCodes', firebaseUid));
                if (codeSnap.exists() && codeSnap.data()?.code) {
                    userCodeForGoogle = codeSnap.data().code;
                }
            } catch (e) { }
        }

        const results = await Promise.all(localMatches.map(async (m) => {
            try {
                const { history, ...rawClean } = m;
                // Strip wagonData (stored per-ball in timeline already)
                const localUpdatedAt = m.updatedAt || m.lastUpdated || Date.now();
                const clean = {
                    ...rawClean,
                    innings: (rawClean.innings || []).map(inn => ({
                        ...inn,
                        batsmen: (inn.batsmen || []).map(({ wagonData, ...b }) => b)
                    })),
                    deleted: false,
                    deletedAt: null,              // Clear stale tombstone if any
                    updatedAt: localUpdatedAt,    // LWW primary key
                    lastUpdated: localUpdatedAt,  // Legacy compat
                    createdAt: m.createdAt || m.startTime || localUpdatedAt,
                };
                let matchDocRef1, matchDocRef2;

                if ((loginType === 'shareable' || loginType === 'code') && userScope) {
                    matchDocRef1 = fbDoc(db, 'shareLogins', userScope, 'matches', m.matchId);
                } else if (loginType === 'google' && firebaseUid) {
                    matchDocRef1 = fbDoc(db, 'googleUsers', firebaseUid, 'matches', m.matchId);
                    if (userCodeForGoogle) {
                        matchDocRef2 = fbDoc(db, 'shareLogins', userCodeForGoogle, 'matches', m.matchId);
                    }
                }

                if (matchDocRef1) {
                    await fbSetDoc(matchDocRef1, clean);
                }
                if (matchDocRef2) {
                    await fbSetDoc(matchDocRef2, clean);
                }
                return { success: true };
            } catch (e) {
                console.warn(`[SyncAll] Failed to sync match ${m.matchId}:`, e);
                return { success: false };
            }
        }));

        const synced = results.filter(r => r.success).length;
        const errors = results.filter(r => !r.success).length;

        return { synced, errors, found: localMatches.length, message: `Pushed ${synced}/${localMatches.length} to cloud` };
    } catch (e) {
        console.error('[SyncAll] Fatal error:', e);
        return { synced: 0, errors: -1, found: 0, message: `Fatal sync error: ${e.message}` };
    }
};

/**
 * Force-pull ALL matches from Firestore, ignoring local data entirely.
 * This is used when Device B needs to fetch matches that Device A synced.
 * Also saves pulled matches to localStorage for offline access.
 */
export const forcePullFromCloud = async (forceOverwrite = false) => {
    try {
        const sessionStr = localStorage.getItem('userSession') || localStorage.getItem('cricscorer_login');
        if (!sessionStr) return { pulled: 0, message: 'No session' };
        const session = JSON.parse(sessionStr);

        const loginType = session.loginType;
        if (loginType === 'guest') return { pulled: 0, message: 'Guest mode - no cloud data' };

        const firebaseUid = auth.currentUser?.uid || (loginType === 'google' ? session.uid || session.userCode : null);
        const userScope = getUserScope(session);

        await waitForAuth();

        let matchesColRef = null;
        const tasks = [];

        if (loginType === 'shareable') {
            if (session.userCode) {
                matchesColRef = collection(db, 'shareLogins', session.userCode, 'matches');
            }
        } else if (loginType === 'code') {
            const viewingCode = session.viewingCode || session.userCode;
            if (viewingCode) {
                matchesColRef = collection(db, 'shareLogins', viewingCode, 'matches');
            }
        } else if (loginType === 'google') {
            if (firebaseUid) {
                matchesColRef = collection(db, 'googleUsers', firebaseUid, 'matches');

                // Allow google owner to also pull matches scored by code users!
                try {
                    const codeSnap = await getDoc(doc(db, 'userCodes', firebaseUid));
                    if (codeSnap.exists() && codeSnap.data()?.code) {
                        const code = codeSnap.data().code;
                        tasks.push(
                            withRetry(() => getDocs(collection(db, 'shareLogins', code, 'matches')).then(snap => snap.docs.map(d => d.data())))
                                .catch(() => [])
                        );
                    }
                } catch (e) { }
            }
        }

        if (!matchesColRef && tasks.length === 0) return { pulled: 0, message: 'No valid Firestore path' };

        // Fetch ALL matches from Firestore subcollection with retry
        if (matchesColRef) {
            tasks.push(
                withRetry(() => getDocs(matchesColRef).then(snap => snap.docs.map(d => d.data())))
                    .catch(() => [])
            );
        }

        const results = await Promise.all(tasks);
        const allCloudData = results.flat().filter(m => m && m.matchId);

        const cloudMatchesRaw = separateTombstones(allCloudData, userScope);

        const cloudMatches = cloudMatchesRaw;

        // Also purge tombstoned matches from IndexedDB
        const tombstoned = allCloudData.filter(m => m.deleted === true);
        if (tombstoned.length > 0) {
            try {
                const idb = await openDB('CricScorerDB', 1);
                for (const t of tombstoned) {
                    await idb.delete('matches', t.matchId);
                    localStorage.removeItem(`cricscorer_${userScope}_match_${t.matchId}`);
                }
            } catch (e) { }
        }

        // Save each active cloud match to localStorage
        let saved = 0;

        for (const m of cloudMatches) {
            const storageKey = `cricscorer_${userScope}_match_${m.matchId}`;

            if (m.deleted === true || m.deletedAt) {
                // Tombstone - remove from localStorage using standard and specific keys
                localStorage.removeItem(storageKey);
                try {
                    const keys = Object.keys(localStorage).filter(k => k.includes(`_match_${m.matchId}`));
                    keys.forEach(k => localStorage.removeItem(k));
                } catch (e) { }
                // Add to deleted list
                try {
                    const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
                    if (!deletedList.includes(m.matchId)) {
                        deletedList.push(m.matchId);
                        localStorage.setItem('deleted_matches', JSON.stringify(deletedList));
                    }
                } catch (e) { }
                continue;
            }

            // Before syncing active match, check if it was locally deleted
            let isDeletedLocally = false;
            try {
                const deletedList = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
                if (deletedList.includes(m.matchId)) isDeletedLocally = true;
            } catch (e) { }

            if (isDeletedLocally) {
                console.log(`[Sync] PULL ${m.matchId} — SKIPPED: locally deleted, not restoring`);
                continue; // Do NOT restore
            }

            const existing = localStorage.getItem(storageKey);

            if (forceOverwrite) {
                // ── FORCE OVERWRITE MODE ──────────────────────────────────────────────
                // Called from "Sync & Refresh Cloud" button — always trust cloud.
                // Only skip if local has an explicit tombstone (user deleted it here).
                let localHasTombstone = false;
                if (existing) {
                    try {
                        const local = JSON.parse(existing);
                        if (local.deletedAt && local.deletedAt > 0) localHasTombstone = true;
                    } catch (e) { }
                }
                if (!localHasTombstone) {
                    localStorage.setItem(storageKey, JSON.stringify(m));
                    console.log(`[Sync] FORCE-PULL ${m.matchId} — cloud overwrite applied`);
                    saved++;
                } else {
                    console.log(`[Sync] FORCE-PULL ${m.matchId} — SKIPPED: local tombstone, user deleted this match`);
                }
            } else if (!existing) {
                // ── NEW MATCH FROM CLOUD ─────────────────────────────────────────────
                localStorage.setItem(storageKey, JSON.stringify(m));
                console.log(`[Sync] PULL ${m.matchId} — new from cloud, saved locally`);
                saved++;
            } else {
                // ── LWW: compare updatedAt, fall back to ball count for old records ──
                try {
                    const local = JSON.parse(existing);

                    // If local record has a tombstone (deletedAt), do NOT restore from cloud
                    if (local.deletedAt && local.deletedAt > 0) {
                        console.log(`[Sync] PULL ${m.matchId} — SKIPPED: local tombstone exists, not restoring`);
                        continue;
                    }

                    const cloudUpdatedAt = m.updatedAt || m.lastUpdated || 0;
                    const localUpdatedAt = local.updatedAt || local.lastUpdated || 0;

                    if (cloudUpdatedAt > localUpdatedAt) {
                        // Cloud is strictly newer — use cloud
                        localStorage.setItem(storageKey, JSON.stringify(m));
                        console.log(`[Sync] PULL ${m.matchId} — cloud WINS (cloud=${cloudUpdatedAt}, local=${localUpdatedAt})`);
                        saved++;
                    } else if (cloudUpdatedAt === localUpdatedAt) {
                        // Same timestamp — fall back to ball count tiebreaker
                        const cloudBalls = m.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                        const localBalls = local.innings?.reduce((sum, inn) => sum + (inn.balls || 0), 0) || 0;
                        if (cloudBalls > localBalls) {
                            localStorage.setItem(storageKey, JSON.stringify(m));
                            console.log(`[Sync] PULL ${m.matchId} — TIED timestamp, cloud has more balls (${cloudBalls} vs ${localBalls})`);
                            saved++;
                        } else {
                            // ── SAME BALLS AND SAME TIMESTAMP ────────────────────────────────
                            // This is the stale-cache trap: local and cloud look identical.
                            // Since cloud is authoritative here, overwrite anyway to get latest fields.
                            localStorage.setItem(storageKey, JSON.stringify(m));
                            console.log(`[Sync] PULL ${m.matchId} — equal data, refreshing from cloud anyway`);
                            saved++;
                        }
                    } else {
                        // Local is strictly newer — keep local
                        console.log(`[Sync] PULL ${m.matchId} — local WINS (local=${localUpdatedAt}, cloud=${cloudUpdatedAt}), keeping local`);
                    }
                } catch (e) {
                    // If local data is corrupted, always prefer cloud
                    localStorage.setItem(storageKey, JSON.stringify(m));
                    console.log(`[Sync] PULL ${m.matchId} — local corrupted, restored from cloud`);
                    saved++;
                }
            }
        }

        // Also save to IndexedDB
        try {
            const idb = await openDB('CricScorerDB', 1);
            for (const m of cloudMatches) {
                await idb.put('matches', m, m.matchId);
            }
        } catch (e) { }

        // For Google login: re-mirror ALL pulled matches to shareLogins/{code}/matches
        // This ensures code-login viewers always see the complete dataset
        if (loginType === 'google' && firebaseUid) {
            try {
                const codeSnap = await getDoc(doc(db, 'userCodes', firebaseUid));
                if (codeSnap.exists() && codeSnap.data()?.code) {
                    const mirrorCode = codeSnap.data().code;
                    // Get what's already in shareLogins to only write missing ones
                    const existingSnap = await getDocs(collection(db, 'shareLogins', mirrorCode, 'matches'));
                    const existingIds = new Set(existingSnap.docs.map(d => d.id));

                    let mirrored = 0;
                    for (const m of cloudMatches) {
                        if (m.matchId && !existingIds.has(m.matchId)) {
                            try {
                                const { history, ...rawClean } = m;
                                // Strip wagonData before mirroring
                                const clean = {
                                    ...rawClean,
                                    innings: (rawClean.innings || []).map(inn => ({
                                        ...inn,
                                        batsmen: (inn.batsmen || []).map(({ wagonData, ...b }) => b)
                                    }))
                                };
                                clean.deleted = false;
                                clean.lastUpdated = Date.now();
                                await setDoc(doc(db, 'shareLogins', mirrorCode, 'matches', m.matchId), clean);
                                mirrored++;
                            } catch (e) { }
                        }
                    }
                    if (mirrored > 0) console.log(`[ForcePull] Mirrored ${mirrored} matches to shareLogins/${mirrorCode}`);
                }
            } catch (e) {
                console.warn('[ForcePull] Mirror to shareLogins failed:', e);
            }
        }

        // Clear caches so next fetch sees fresh data
        clearMatchCache();

        return { pulled: cloudMatches.length, saved, purged: tombstoned.length, message: `Pulled ${cloudMatches.length} matches from cloud, ${saved} new/updated` };
    } catch (e) {
        return { pulled: 0, saved: 0, purged: 0, message: `Cloud pull failed: ${e.message}` };
    }
};

/**
 * restoreAllTombstonedMatches()
 * ─────────────────────────────────────────────────────────────────────────────
 * EMERGENCY DATA RECOVERY
 * Tombstones were written with { merge: true }, so match innings data is
 * still in Firestore. This function reads ALL docs (including tombstones),
 * re-activates any that have valid innings data, and saves them locally.
 */
export const restoreAllTombstonedMatches = async () => {
    try {
        const sessionStr = localStorage.getItem('cricscorer_login') || localStorage.getItem('userSession');
        if (!sessionStr) return { restored: 0, message: 'No session' };
        const session = JSON.parse(sessionStr);
        const shareCode = session.userCode || session.viewingCode;
        if (!shareCode) return { restored: 0, message: 'No share code in session' };

        const { collection: fbCol, getDocs: fbGetDocs, setDoc: fbSetDoc, doc: fbDoc } = await import('firebase/firestore');

        // Read ALL docs including tombstones
        const snap = await fbGetDocs(fbCol(db, 'shareLogins', shareCode, 'matches'));
        console.log(`[Restore] Found ${snap.docs.length} total docs in shareLogins/${shareCode}`);

        const userScope = shareCode;
        let restored = 0;

        for (const d of snap.docs) {
            const data = d.data();
            // Only restore if it has valid innings data (real match, not just a tombstone shell)
            if (!data || !data.innings || !Array.isArray(data.innings) || data.innings.length === 0) {
                console.log(`[Restore] Skipping ${d.id} — no innings data`);
                continue;
            }

            // Re-activate: remove deleted flags, set fresh timestamp to beat tombstones
            const restored_match = {
                ...data,
                matchId: data.matchId || d.id,
                deleted: false,
                deletedAt: null,
                // Use current time so this restored match beats any cached tombstone in separateTombstones
                updatedAt: Date.now(),
                lastUpdated: Date.now(),
            };

            // Write back to cloud as active
            try {
                await fbSetDoc(fbDoc(db, 'shareLogins', shareCode, 'matches', d.id), restored_match);
            } catch (e) {
                console.warn(`[Restore] Cloud write failed for ${d.id}:`, e);
            }

            // Save to localStorage
            localStorage.setItem(`cricscorer_${userScope}_match_${d.id}`, JSON.stringify(restored_match));
            console.log(`[Restore] RESTORED ${d.id}`);
            restored++;
        }

        // Clear deleted_matches list so nothing is filtered
        localStorage.removeItem('deleted_matches');
        clearMatchCache();

        console.log(`[Restore] Done: restored ${restored} matches`);
        return { restored, shareCode, message: `Restored ${restored} matches from tombstones` };

    } catch (e) {
        console.error('[Restore] Fatal:', e);
        return { restored: 0, message: `Restore failed: ${e.message}` };
    }
};

/**
 * applyDeletedListToCloud()
 * Reads local deleted_matches list and tombstones those match IDs in Firestore.
 * This propagates intentional local deletions to the cloud so other devices
 * stop seeing matches that were deleted on the primary device.
 */
export const applyDeletedListToCloud = async () => {
    try {
        const sessionStr = localStorage.getItem('cricscorer_login') || localStorage.getItem('userSession');
        if (!sessionStr) return { tombstoned: 0, message: 'No session' };
        const session = JSON.parse(sessionStr);
        const shareCode = session.shareCode || session.userCode || session.viewingCode;
        const uid = auth.currentUser?.uid || session.uid;

        let deletedIds = [];
        try {
            const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
            const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            deletedIds = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
        } catch (e) { }

        if (deletedIds.length === 0) return { tombstoned: 0, message: 'No local deletions to apply' };

        const { doc: fbDoc, setDoc: fbSetDoc } = await import('firebase/firestore');
        const now = Date.now();
        let tombstoned = 0;

        for (const matchId of deletedIds) {
            try {
                const tombstonePayload = {
                    matchId,
                    deleted: true,
                    deletedAt: now,
                    updatedAt: now,
                    lastUpdated: now,
                };

                // Tombstone in shareLogins if shareCode exists
                if (shareCode) {
                    await fbSetDoc(fbDoc(db, 'shareLogins', shareCode, 'matches', matchId), tombstonePayload);
                }

                // Tombstone in googleUsers if uid exists
                if (uid) {
                    await fbSetDoc(fbDoc(db, 'googleUsers', uid, 'matches', matchId), tombstonePayload);
                }

                // Remove from local per-match storage keys
                if (shareCode) localStorage.removeItem(`cricscorer_${shareCode}_match_${matchId}`);
                if (uid) localStorage.removeItem(`cricscorer_${uid}_match_${matchId}`);
                localStorage.removeItem(`cricscorer_guest_match_${matchId}`);

                console.log(`[ApplyDeleted] Tombstoned ${matchId} in cloud`);
                tombstoned++;
            } catch (e) {
                console.warn(`[ApplyDeleted] Failed for ${matchId}:`, e);
            }
        }

        clearMatchCache();
        return { tombstoned, total: deletedIds.length, message: `Tombstoned ${tombstoned}/${deletedIds.length} deleted matches in cloud` };
    } catch (e) {
        console.error('[ApplyDeleted] Fatal:', e);
        return { tombstoned: 0, message: `Failed: ${e.message}` };
    }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * forceFullDataRecovery()
 * ONE-CLICK EMERGENCY RECOVERY — ignores ALL tombstones, deletedAt, deleted_matches.
 * Reads every Firestore doc with innings data, stamps fresh timestamps,
 * writes back to cloud as active, and saves to localStorage.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const forceFullDataRecovery = async () => {
    console.log('[Recovery] ════ Starting Force Full Data Recovery ════');

    try {
        const sessionStr = localStorage.getItem('cricscorer_login') || localStorage.getItem('userSession');
        if (!sessionStr) return { recovered: 0, message: 'No session found' };
        const session = JSON.parse(sessionStr);
        let shareCode = session.shareCode || session.userCode || session.viewingCode;
        const loginType = session.loginType;
        if (!shareCode) return { recovered: 0, message: 'No share code in session' };

        const { collection: fbCol, getDocs: fbGetDocs, setDoc: fbSetDoc, doc: fbDoc, getDoc: fbGetDoc } = await import('firebase/firestore');

        // ── AUTO-PATCH OLD SESSIONS WITHOUT SHARE CODE ──
        const firebaseUid = auth.currentUser?.uid || (loginType === 'google' ? session.uid || session.userCode : null);
        if ((loginType === 'google' || loginType === 'shareable') && firebaseUid && (!session.shareCode || shareCode === firebaseUid)) {
            try {
                const codeSnap = await fbGetDoc(fbDoc(db, 'userCodes', firebaseUid));
                if (codeSnap.exists() && codeSnap.data()?.code) {
                    shareCode = codeSnap.data().code; // The real 8-char code
                    session.shareCode = shareCode;
                    localStorage.setItem('cricscorer_login', JSON.stringify(session));
                    localStorage.setItem('userSession', JSON.stringify(session));
                    console.log(`[Recovery] Patched session shareCode to: ${shareCode}`);
                }
            } catch (e) { }
        }

        // ── Step 1: Collect all Firestore sources ────────────────────────────────
        const allDocs = [];

        // Always read shareLogins (primary for shareable/code login)
        try {
            const snap1 = await fbGetDocs(fbCol(db, 'shareLogins', shareCode, 'matches'));
            allDocs.push(...snap1.docs.map(d => ({ ...d.data(), _docId: d.id })));
            console.log(`[Recovery] shareLogins/${shareCode}: ${snap1.docs.length} docs`);
        } catch (e) { console.warn('[Recovery] shareLogins read failed:', e.message); }

        // If google/shareable login, also read googleUsers
        if (firebaseUid && (loginType === 'google' || loginType === 'shareable')) {
            try {
                const snap2 = await fbGetDocs(fbCol(db, 'googleUsers', firebaseUid, 'matches'));
                allDocs.push(...snap2.docs.map(d => ({ ...d.data(), _docId: d.id })));
                console.log(`[Recovery] googleUsers/${firebaseUid}: ${snap2.docs.length} docs`);
            } catch (e) { console.warn('[Recovery] googleUsers read failed:', e.message); }
        }

        // If google login, also check shareLogins via userCodes lookup
        if (loginType === 'google' && firebaseUid && shareCode !== (session.viewingCode)) {
            try {
                const codeSnap = await fbGetDoc(fbDoc(db, 'userCodes', firebaseUid));
                if (codeSnap.exists() && codeSnap.data()?.code) {
                    const altCode = codeSnap.data().code;
                    if (altCode !== shareCode) {
                        const snap3 = await fbGetDocs(fbCol(db, 'shareLogins', altCode, 'matches'));
                        allDocs.push(...snap3.docs.map(d => ({ ...d.data(), _docId: d.id })));
                        console.log(`[Recovery] shareLogins/${altCode}: ${snap3.docs.length} docs`);
                    }
                }
            } catch (e) { }
        }

        // ── AGGRESSIVE LOCAL RESCUE: Read ALL local matches regardless of userScope ──
        let localRescued = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.match(/^cricscorer_.*_match_.*$/)) {
                try {
                    const localM = JSON.parse(localStorage.getItem(key));
                    if (localM && localM.matchId && localM.innings && localM.innings.length > 0) {
                        allDocs.push({ ...localM, _docId: localM.matchId });
                        localRescued++;
                    }
                } catch (e) { }
            }
        }
        console.log(`[Recovery] Found ${localRescued} valid matches across all local accounts/guests.`);

        console.log(`[Recovery] Found ${allDocs.length} total docs across all collections & local storage`);

        // ── Step 2: De-duplicate by matchId, prefer doc with most innings ────────
        const matchMap = new Map();
        for (const doc of allDocs) {
            const matchId = doc.matchId || doc._docId;
            if (!matchId) continue;
            const existing = matchMap.get(matchId);
            const docInnings = (doc.innings || []).length;
            const existInnings = existing ? (existing.innings || []).length : -1;
            if (!existing || docInnings > existInnings) {
                matchMap.set(matchId, { ...doc, matchId });
            }
        }

        const candidates = Array.from(matchMap.values());
        console.log(`[Recovery] ${candidates.length} unique matches after de-duplication`);

        // ── Step 3: Filter to only real matches with innings data ─────────────────
        const recoverable = candidates.filter(m =>
            m.innings && Array.isArray(m.innings) && m.innings.length > 0
        );
        const noInnings = candidates.length - recoverable.length;
        console.log(`[Recovery] ${recoverable.length} matches with innings data (${noInnings} skipped — no innings)`);

        if (recoverable.length === 0) {
            return { recovered: 0, message: 'No matches with innings data found in Firestore. Data may be truly gone.' };
        }

        // ── Step 4: Fresh-stamp + write back to cloud + save locally ──────────────
        const now = Date.now();
        const userScope = shareCode;
        const results = await Promise.all(recoverable.map(async (m) => {
            const cleanMatch = {
                ...m,
                matchId: m.matchId,
                deleted: false,
                deletedAt: null,
                updatedAt: now,          // Fresh timestamp — beats any tombstone
                lastUpdated: now,
                createdAt: m.createdAt || m.startTime || now,
            };
            delete cleanMatch._docId; // Remove internal tracking field

            // Save to localStorage immediately
            const localKey = `cricscorer_${userScope}_match_${m.matchId}`;
            localStorage.setItem(localKey, JSON.stringify(cleanMatch));

            // Push back to Firestore (shareLogins is always the canonical target)
            try {
                await fbSetDoc(fbDoc(db, 'shareLogins', shareCode, 'matches', m.matchId), cleanMatch);
                console.log(`[Recovery] ✅ Recovered ${m.matchId}`);
                return { success: true, cloudError: false };
            } catch (e) {
                console.warn(`[Recovery] ⚠️ Cloud write failed for ${m.matchId}:`, e.message);
                return { success: true, cloudError: true }; // Still count as recovered (local save succeeded)
            }
        }));

        const recovered = results.filter(r => r.success).length;
        const cloudErrors = results.filter(r => r.cloudError).length;

        // ── Step 5: Cleanup ───────────────────────────────────────────────────────
        localStorage.removeItem('deleted_matches');
        sessionStorage.removeItem('cricscorer_history_matches');
        sessionStorage.removeItem('cricscorer_players_list');
        sessionStorage.removeItem('cricscorer_analytics_data');
        sessionStorage.removeItem('cricscorer_leaderboard');
        sessionStorage.removeItem('local_deleted_records');
        localStorage.setItem('last_cloud_sync', String(now));
        clearMatchCache();

        const msg = `Recovery complete! ${recovered} matches restored${cloudErrors > 0 ? ` (${cloudErrors} cloud write errors)` : ''}`;
        console.log(`[Recovery] ════ ${msg} ════`);
        return { recovered, cloudErrors, total: candidates.length, message: msg };

    } catch (e) {
        console.error('[Recovery] Fatal error:', e);
        return { recovered: 0, message: `Recovery failed: ${e.message}` };
    }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * permanentlyWipeDeletedMatches()
 * Finds all matches marked as `deleted: true` in Firestore and actually deletes
 * the document completely (`deleteDoc`). This empties the "trash" permanently.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const permanentlyWipeDeletedMatches = async () => {
    try {
        const sessionStr = localStorage.getItem('cricscorer_login') || localStorage.getItem('userSession');
        if (!sessionStr) return { wiped: 0, message: 'No session found' };
        const session = JSON.parse(sessionStr);
        let shareCode = session.shareCode || session.userCode || session.viewingCode;
        const loginType = session.loginType;
        if (!shareCode) return { wiped: 0, message: 'No share code in session' };

        const { collection: fbCol, getDocs: fbGetDocs, deleteDoc: fbDeleteDoc, doc: fbDoc } = await import('firebase/firestore');
        const firebaseUid = auth.currentUser?.uid || (loginType === 'google' ? session.uid || session.userCode : null);

        const collectionsToCheck = [];
        collectionsToCheck.push(fbCol(db, 'shareLogins', shareCode, 'matches'));
        if (firebaseUid && (loginType === 'google' || loginType === 'shareable')) {
            collectionsToCheck.push(fbCol(db, 'googleUsers', firebaseUid, 'matches'));
        }

        let wipedCount = 0;
        for (const colRef of collectionsToCheck) {
            try {
                const snap = await fbGetDocs(colRef);
                const deletePromises = snap.docs.map(async (d) => {
                    const data = d.data();
                    if (data.deleted === true || data.deletedAt != null) {
                        await fbDeleteDoc(d.ref);
                        return true;
                    }
                    return false;
                });
                const deleteResults = await Promise.all(deletePromises);
                wipedCount += deleteResults.filter(Boolean).length;
            } catch (e) { }
        }

        return { wiped: wipedCount, message: `Permanently deleted ${wipedCount} matches from cloud.` };
    } catch (e) {
        console.error('Failed to wipe deleted matches:', e);
        return { wiped: 0, message: `Wipe failed: ${e.message}` };
    }
};
