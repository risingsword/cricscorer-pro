import React, { useEffect, useState, useRef, useCallback } from 'react';
import useScrollRestore from '../hooks/useScrollRestore';
import { getScroll } from '../utils/scrollStore';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import Header from '../components/Header';

import { Play, ClipboardList, Trash2, Share2, Cloud, RefreshCcw, CheckCircle, Settings, Lock } from 'lucide-react';
import { openDB } from 'idb';
import { db, auth } from '../firebase';
import { doc, setDoc, updateDoc, deleteField, getDoc, collection, getDocs } from 'firebase/firestore';
import {
    clearMatchCache,
    addDeletedMatchId,
    syncAllLocalMatchesToCloud,
    forceFullDataRecovery,
    permanentlyWipeDeletedMatches,
    forcePullFromCloud,
    fetchAllMatches,
    getMatchTimestamp,
    getUserScope,
    applyDeletedListToCloud
} from '../utils/dataFetcher';
import { canEditMatch, canDeleteMatch, getCurrentSession } from '../utils/matchPermissions';

// Persistent module-level cache to avoid async re-fetching & layout shifts on back-navigation
let historyMatchesCache = null;
let historyHasAnimatedOnce = false;

export const clearHistoryModuleCache = () => {
    historyMatchesCache = null;
    historyHasAnimatedOnce = false;
};

const History = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const containerRef = useRef(null);

    const [matches, setMatches] = useState(() => {
        if (historyMatchesCache && historyMatchesCache.length > 0) {
            return historyMatchesCache;
        }
        const cached = sessionStorage.getItem('cricscorer_history_matches');
        return cached ? JSON.parse(cached) : [];
    });
    const [loading, setLoading] = useState(() => {
        if (historyMatchesCache && historyMatchesCache.length > 0) return false;
        return !sessionStorage.getItem('cricscorer_history_matches');
    });
    const [matchTypeFilter, setMatchTypeFilter] = useState(() => {
        return sessionStorage.getItem('historyMatchTypeFilter') || 'All Matches';
    });
    const [hasTournaments, setHasTournaments] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [syncMessage, setSyncMessage] = useState(null);
    const [offlineToast, setOfflineToast] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [syncActionLoading, setSyncActionLoading] = useState(null);
    const [renderLimit, setRenderLimit] = useState(() => {
        const saved = getScroll('history');
        return saved > 0 ? 100 : 15;
    });

    const skipStagger = useRef(historyHasAnimatedOnce).current;

    useEffect(() => {
        historyHasAnimatedOnce = true;
    }, []);

    useEffect(() => {
        if (renderLimit < matches.length) {
            const timer = setTimeout(() => {
                setRenderLimit(prev => Math.min(prev + 10, matches.length));
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [renderLimit, matches.length]);

    const cloudSyncAll = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setSyncResult(null);
        setSyncMessage(null);
        try {
            // Step 1: Force-pull ALL matches FROM cloud (gets tombstones, updates local data)
            // forceOverwrite=true: user explicitly clicked sync, always trust cloud over local cache.
            let pullResult = { pulled: 0, saved: 0 };
            if (state.loginType && state.loginType !== 'guest') {
                pullResult = await forcePullFromCloud(true);
            }

            // Step 2: Push local matches TO cloud
            let pushResult = { synced: 0, errors: 0, found: 0 };
            if (state.loginType && state.loginType !== 'guest') {
                pushResult = await syncAllLocalMatchesToCloud();
            }

            // Build user-friendly message
            const parts = [];
            if (pushResult.synced > 0) parts.push(`⬆ ${pushResult.synced} pushed`);
            if (pullResult.saved > 0) parts.push(`⬇ ${pullResult.saved} new from cloud`);
            if (pullResult.purged > 0) parts.push(`🗑 ${pullResult.purged} deleted`);
            if (pullResult.pulled > 0 && pullResult.saved === 0 && !pullResult.purged) parts.push(`☁ ${pullResult.pulled} in cloud (up to date)`);
            if (parts.length === 0) parts.push('✓ Everything synced');

            setSyncMessage(parts.join(' • '));
            setSyncResult({ synced: pushResult.synced, errors: pushResult.errors });
            clearMatchCache();
            // Clear ALL derived-data caches so Players, Analytics, etc. rebuild from fresh match data
            sessionStorage.removeItem('cricscorer_history_matches');
            sessionStorage.removeItem('cricscorer_players_list');
            sessionStorage.removeItem('cricscorer_analytics_data');
            sessionStorage.removeItem('cricscorer_leaderboard');
            sessionStorage.removeItem('local_deleted_records');
            await loadMatches();

            setTimeout(() => { setSyncResult(null); setSyncMessage(null); }, 5000);
        } catch (e) {
            console.error('Refresh/Sync error:', e);
            setSyncResult({ synced: 0, errors: -1 });
            setSyncMessage('Sync failed - check connection');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleRestoreDeleted = async () => {
        if (window.confirm('This will restore all hidden players AND matches deleted on this device by mistake. Continue?')) {
            setSyncActionLoading('restore');
            try {
                localStorage.removeItem('cricscorer_blocked_names');
                localStorage.removeItem('deleted_matches');
                sessionStorage.removeItem('cricscorer_players_list');
                sessionStorage.removeItem('local_deleted_records');
                await loadMatches();
                setShowSettingsPanel(false);
                alert('Deleted matches restored! You may need to sync again.');
            } catch (e) {
                alert(`Error: ${e.message}`);
            } finally {
                setSyncActionLoading(null);
            }
        }
    };

    const handleForceFullRecovery = async () => {
        if (!window.confirm(
            '🆘 FORCE FULL DATA RECOVERY\n\n' +
            'This will:\n' +
            '• Read ALL Firestore docs (ignore tombstones)\n' +
            '• Stamp every match with a fresh timestamp\n' +
            '• Save to cloud + local storage\n' +
            '• Clear deleted_matches cache\n\n' +
            '⚠️ Some intentionally deleted matches may reappear.\n\nContinue?'
        )) return;

        setSyncActionLoading('full-recovery');
        try {
            const result = await forceFullDataRecovery();
            setShowSettingsPanel(false);
            if (result.recovered === 0) {
                alert(`❌ Recovery Failed\n\n${result.message}`);
            } else {
                alert(`✅ Recovery Complete!\n\n• ${result.recovered} matches recovered\n• Cloud updated with fresh timestamps\n\nPage will reload now.`);
                window.location.reload();
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        } finally {
            setSyncActionLoading(null);
        }
    };

    const handleEmptyTrash = async () => {
        if (window.confirm('⚠️ EMPTY TRASH ⚠️\n\nThis will PERMANENTLY delete all hidden/deleted matches from the cloud so they can NEVER be recovered again.\n\nAre you absolutely sure?')) {
            setSyncActionLoading('empty-trash');
            try {
                const result = await permanentlyWipeDeletedMatches();
                setShowSettingsPanel(false);
                alert(`✅ Trash Emptied!\n\n${result.message}`);
                loadMatches();
            } catch (e) {
                alert(`Error: ${e.message}`);
            } finally {
                setSyncActionLoading(null);
            }
        }
    };

    const handleForcePush = async () => {
        if (window.confirm('This will OVERWRITE the Cloud with this device\'s data. Use this if this device has the correct data. Continue?')) {
            setSyncActionLoading('push');
            try {
                const res = await syncAllLocalMatchesToCloud();
                setShowSettingsPanel(false);
                alert(`✅ Pushed ${res.synced} matches to Cloud!`);
            } catch (e) {
                alert(`Push failed: ${e.message}`);
            } finally {
                setSyncActionLoading(null);
            }
        }
    };



    const handleHardReset = async () => {
        if (window.confirm('⚠️ WARNING: This will wipe ALL local match data and re-sync from Cloud. Login session will be preserved. Continue?')) {
            setSyncActionLoading('reset');
            try {
                // Preserve login session BEFORE wiping — cricscorer_login starts with 'cricscorer_'
                // so it would be deleted by the bulk key wipe, logging the user out.
                const sessionBackup = localStorage.getItem('cricscorer_login');
                const userSessionBackup = localStorage.getItem('userSession');
                const blockedBackup = localStorage.getItem('cricscorer_blocked_names');

                // Wipe all match/data keys
                const keysToDelete = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('cricscorer_')) keysToDelete.push(key);
                }
                keysToDelete.forEach(k => localStorage.removeItem(k));
                localStorage.removeItem('cricscore_tournaments');
                localStorage.removeItem('deleted_matches');
                localStorage.removeItem('cricscorer_matches');

                // Restore session so user stays logged in after reload
                if (sessionBackup) localStorage.setItem('cricscorer_login', sessionBackup);
                if (userSessionBackup) localStorage.setItem('userSession', userSessionBackup);
                if (blockedBackup) localStorage.setItem('cricscorer_blocked_names', blockedBackup);

                try {
                    const idb = await openDB('CricScorerDB', 1);
                    const tx = idb.transaction('matches', 'readwrite');
                    await tx.store.clear();
                    await tx.done;
                } catch (e) { }
                alert('Local match data wiped. App will reload and fetch fresh data from Cloud.');
                window.location.reload();
            } catch (e) {
                alert(`Reset failed: ${e.message}`);
            } finally {
                setSyncActionLoading(null);
            }
        }
    };


    useEffect(() => {
        // Fix 1: Only run async loadMatches on cold mount (when cache is empty).
        // Returning from Match Details uses module-level historyMatchesCache synchronously on frame 0.
        if (!historyMatchesCache || historyMatchesCache.length === 0) {
            loadMatches();
        }

        // Auto-sync on History page load
        if (state.loginType && state.loginType !== 'guest') {
            (async () => {
                try {
                    const pullResult = await forcePullFromCloud();
                    await syncAllLocalMatchesToCloud();
                    if (pullResult.saved > 0 || pullResult.purged > 0) {
                        clearMatchCache();
                        historyMatchesCache = null;
                        sessionStorage.removeItem('cricscorer_history_matches');
                        loadMatches();
                    }
                } catch (e) { }
            })();
        }

        // Auto-refresh when app comes to foreground
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                if (state.loginType && state.loginType !== 'guest') {
                    cloudSyncAll();
                } else {
                    loadMatches();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [state.loginType]); // Reduced dependencies to prevent infinite loops

    // Pre-paint scroll restoration — Invisible Ready-Then-Reveal
    useScrollRestore('history', !loading, containerRef);

    const loadMatches = async () => {
        const processData = (regularMatches) => {
            const storedTournaments = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
            setHasTournaments(storedTournaments.length > 0);
            let tournamentMatches = [];
            storedTournaments.forEach(t => {
                t.matches.forEach(m => {
                    if ((m.status === 'completed' || m.status === 'live') && m.matchState) {
                        tournamentMatches.push({
                            ...m.matchState,
                            isTournamentMatch: true,
                            tournamentName: t.name,
                            matchId: m.matchId
                        });
                    }
                });
            });

            const allMatches = [...regularMatches, ...tournamentMatches];

            const uniqueMap = new Map();
            allMatches.forEach(m => {
                if (m.matchId) {
                    if (!uniqueMap.has(m.matchId)) {
                        uniqueMap.set(m.matchId, m);
                    } else if (!m.isTournamentMatch) {
                        uniqueMap.set(m.matchId, { ...uniqueMap.get(m.matchId), ...m });
                    }
                }
            });

            const deduplicatedMatches = Array.from(uniqueMap.values());

            let deletedList = [];
            try {
                const persistentDeleted = JSON.parse(localStorage.getItem('deleted_matches') || '[]');
                const sessionDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
                deletedList = Array.from(new Set([...persistentDeleted, ...sessionDeleted]));
            } catch (e) { }

            const visibleMatches = deduplicatedMatches.filter(m => 
                m && m.matchId && !deletedList.includes(m.matchId) && m.deleted !== true && (!m.deletedAt || m.deletedAt <= 0)
            );
            const sorted = visibleMatches.sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a));

            setMatches(prev => {
                const prevIds = prev.map(m => m.matchId).join(',');
                const newIds = sorted.map(m => m.matchId).join(',');
                if (prevIds === newIds && prev.length === sorted.length) {
                    let changed = false;
                    for (let i = 0; i < sorted.length; i++) {
                        const prevBalls = prev[i]?.innings?.reduce((s, inn) => s + (inn.balls || 0), 0) || 0;
                        const newBalls = sorted[i]?.innings?.reduce((s, inn) => s + (inn.balls || 0), 0) || 0;
                        if (
                            prevBalls !== newBalls ||
                            prev[i]?.matchStatus !== sorted[i]?.matchStatus ||
                            prev[i]?.lastUpdated !== sorted[i]?.lastUpdated
                        ) {
                            changed = true;
                            break;
                        }
                    }
                    if (!changed) return prev;
                }
                return sorted;
            });

            try {
                historyMatchesCache = sorted;
                sessionStorage.setItem('cricscorer_history_matches', JSON.stringify(sorted));
            } catch (e) {
                console.warn("Could not cache matches to sessionStorage", e);
            }
            setLoading(false);
        };

        try {
            const initialMatches = await fetchAllMatches(false, processData);
            processData(initialMatches);
        } catch (e) {
            console.error('Fetch error:', e);
            setLoading(false);
        }
    };

    // 5-second countdown delete confirmation
    const startDeleteCountdown = (matchId) => {
        // Cancel any existing countdown
        if (deleteConfirm?.timer) clearInterval(deleteConfirm.timer);

        let countdown = 5;
        const timer = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(timer);
                setDeleteConfirm(null);
                executeDelete(matchId);
            } else {
                setDeleteConfirm(prev => prev ? { ...prev, countdown } : null);
            }
        }, 1000);
        setDeleteConfirm({ matchId, countdown: 5, timer });
    };

    const cancelDeleteCountdown = () => {
        if (deleteConfirm?.timer) clearInterval(deleteConfirm.timer);
        setDeleteConfirm(null);
    };

    const executeDelete = async (id) => {
        try {
            // 1. Optimistic UI update IMMEDIATELY
            setMatches(prev => {
                const list = prev.filter(m => m.matchId !== id);
                sessionStorage.setItem('cricscorer_history_matches', JSON.stringify(list));
                return list;
            });

            // Track deleted ID persistently so it isn't resurrected by cloud pull or refresh
            addDeletedMatchId(id);

            // Track in session too for extra safety during current sync cycle
            const localDeleted = JSON.parse(sessionStorage.getItem('local_deleted_records') || '[]');
            if (!localDeleted.includes(id)) {
                localDeleted.push(id);
                sessionStorage.setItem('local_deleted_records', JSON.stringify(localDeleted));
            }

            const userScope = state.loginType === 'guest' ? 'guest' : (state.userCode || 'guest');

            // 2. Prevent MatchContext auto-sync from bringing it back
            if (state.matchId === id) {
                dispatch({ type: 'INIT_MATCH', payload: { matchId: null } });
            }

            // 3. Clear local storage records
            localStorage.removeItem(`cricscorer_${userScope}_match_${id}`);

            const historyTournaments = localStorage.getItem('cricscore_tournaments');
            if (historyTournaments) {
                try {
                    let tournaments = JSON.parse(historyTournaments);
                    let updatedTournaments = false;
                    tournaments.forEach(t => {
                        t.matches?.forEach(m => {
                            if (m.matchId === id) {
                                m.matchState = null;
                                m.status = 'upcoming';
                                m.result = '';
                                m.winnerId = null;
                                m.winnerName = '';
                                m.team1Score = null;
                                m.team2Score = null;
                                updatedTournaments = true;
                            }
                        });
                    });
                    if (updatedTournaments) {
                        localStorage.setItem('cricscore_tournaments', JSON.stringify(tournaments));
                        tournaments.forEach(t => {
                            try {
                                const tDoc = doc(db, 'tournaments', t.tournamentId);
                                updateDoc(tDoc, { matches: t.matches }).catch(() => { });
                            } catch (e) { }
                        });
                    }
                } catch (e) { }
            }

            const summaryKey = `cricscorer_${userScope}_recent_summaries`;
            const summaries = JSON.parse(localStorage.getItem(summaryKey) || '[]');
            if (summaries.length > 0) {
                localStorage.setItem(summaryKey, JSON.stringify(summaries.filter(s => s.matchId !== id)));
            }

            try {
                const legacyArray = JSON.parse(localStorage.getItem('cricscorer_matches') || '[]');
                const filtered = legacyArray.filter(wrapper => {
                    const mId = wrapper.matchData ? wrapper.matchData.matchId : wrapper.matchId;
                    return mId !== id;
                });
                if (legacyArray.length !== filtered.length) {
                    localStorage.setItem('cricscorer_matches', JSON.stringify(filtered));
                }
            } catch (e) { }

            try {
                const idb = await openDB('CricScorerDB', 1);
                await idb.delete('matches', id);
            } catch (e) { }

            // 4. Fire network requests asynchronously in the background
            const tombstone = { deleted: true, deletedAt: Date.now(), lastUpdated: Date.now(), matchId: id };

            const sess = getCurrentSession();
            const targetCode = sess?.userCode || sess?.viewingCode || state.userCode || state.viewingCode;
            const isShareOrCode = state.loginType === 'shareable' || state.loginType === 'code';

            if (isShareOrCode && targetCode) {
                setDoc(doc(db, 'shareLogins', targetCode, 'matches', id), tombstone).catch(() => { });
                getDoc(doc(db, 'shareLogins', targetCode)).then(pDocSnap => {
                    if (pDocSnap.exists()) {
                        const data = pDocSnap.data();
                        const updates = {};
                        if (data.currentMatch?.matchId === id) updates.currentMatch = deleteField();
                        if (data.matches && Array.isArray(data.matches)) {
                            updates.matches = data.matches.filter(m => m.matchId !== id);
                        }
                        if (Object.keys(updates).length > 0) updateDoc(doc(db, 'shareLogins', targetCode), updates);
                    }
                }).catch(() => { });

            } else if (state.loginType === 'google' && auth.currentUser) {
                const uid = auth.currentUser.uid;
                setDoc(doc(db, 'googleUsers', uid, 'matches', id), tombstone).catch(() => { });
                getDoc(doc(db, 'googleUsers', uid)).then(pDocSnap => {
                    if (pDocSnap.exists()) {
                        const data = pDocSnap.data();
                        const updates = {};
                        if (data.currentMatch?.matchId === id) updates.currentMatch = deleteField();
                        if (data.matches && Array.isArray(data.matches)) {
                            updates.matches = data.matches.filter(m => m.matchId !== id);
                        }
                        if (Object.keys(updates).length > 0) updateDoc(doc(db, 'googleUsers', uid), updates);
                    }
                }).catch(() => { });

                getDoc(doc(db, 'userCodes', uid)).then(codeSnap => {
                    if (codeSnap.exists() && codeSnap.data()?.code) {
                        const code = codeSnap.data().code;
                        setDoc(doc(db, 'shareLogins', code, 'matches', id), tombstone);
                    }
                }).catch(() => { });
            }

            clearMatchCache();
        } catch (e) {
            console.error("Delete failed", e);
            alert("Could not update local storage. Please restart the app.");
        }
    };

    const resumeMatch = (match) => {
        dispatch({ type: 'INIT_MATCH', payload: match });
        if (match.matchStatus === 'innings_break') {
            navigate('/innings-break');
        } else {
            navigate('/live-scoring');
        }
    };

    const viewScorecard = (match) => {
        dispatch({ type: 'INIT_MATCH', payload: match });
        navigate('/scorecard');
    };

    const shareScorecard = (match) => {
        dispatch({ type: 'INIT_MATCH', payload: match });
        navigate('/scorecard?export=true');
    };

    return (
        <div ref={containerRef} style={{ backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: '120px' }}>
            <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white', display: 'flex', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ClipboardList size={20} color="#1e1b4b" />
                    </div>
                    <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b', letterSpacing: '-0.5px' }}>Match Records</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        id="cloud-fetch-refresh-btn"
                        onClick={cloudSyncAll}
                        disabled={isSyncing}
                        style={{
                            background: '#f1f5f9',
                            border: 'none',
                            color: isSyncing ? '#6366f1' : (syncResult ? (syncResult.errors > 0 ? '#f59e0b' : '#10b981') : (loading ? '#94a3b8' : '#6366f1')),
                            width: '40px', height: '40px', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: isSyncing ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: isSyncing ? 'none' : '0 2px 8px rgba(0,0,0,0.04)',
                            padding: '0'
                        }}
                        title={state.loginType === 'guest' ? "Force Fetch Local Data" : "Sync & Refresh Cloud"}
                    >
                        {isSyncing ? (
                            <RefreshCcw size={20} className="animate-spin" />
                        ) : syncResult ? (
                            <CheckCircle size={20} />
                        ) : (
                            <Cloud size={20} />
                        )}
                    </button>
                    <button
                        onClick={() => setShowSettingsPanel(true)}
                        style={{
                            background: '#f1f5f9', border: 'none', color: '#64748b',
                            width: '40px', height: '40px', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', padding: '0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        }}
                        title="Maintenance & Sync Settings"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* Sync Status Toast */}
            {syncMessage && (
                <div className="animate-slide-up" style={{
                    position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: syncResult?.errors > 0 ? '#fef3c7' : '#ecfdf5',
                    color: syncResult?.errors > 0 ? '#92400e' : '#065f46',
                    padding: '10px 20px', borderRadius: '16px', fontSize: '12px', fontWeight: '800',
                    zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxWidth: '85%', textAlign: 'center',
                    border: `1px solid ${syncResult?.errors > 0 ? '#fcd34d' : '#6ee7b7'}`
                }}>
                    {syncMessage}
                </div>
            )}

            <div className="container animate-fade-in" style={{ padding: '12px' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="animate-pulse" style={{ padding: '24px', backgroundColor: 'white', borderRadius: '28px', border: 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <div style={{ width: '80px', height: '12px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}></div>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: '#f5f3ff', borderRadius: '12px' }}></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                                    {[1, 2].map(j => (
                                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '12px', backgroundColor: '#f1f5f9' }}></div>
                                                <div style={{ width: '100px', height: '14px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}></div>
                                            </div>
                                            <div style={{ width: '40px', height: '18px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}></div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ height: '40px', backgroundColor: '#f1f5f9', borderRadius: '12px' }}></div>
                            </div>
                        ))}
                    </div>
                ) : matches.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '32px' }}>
                        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🏟️</div>
                        <h3 style={{ fontWeight: '900', fontSize: '20px', color: '#1e1b4b', marginBottom: '8px' }}>No matches yet</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '600' }}>Start your first match to build history!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {hasTournaments && (
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {['Regular Matches', 'Tournament Matches', 'All Matches'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => {
                                            setMatchTypeFilter(f);
                                            sessionStorage.setItem('historyMatchTypeFilter', f);
                                        }}
                                        style={{
                                            whiteSpace: 'nowrap',
                                            padding: '0 24px',
                                            borderRadius: '14px',
                                            fontSize: '13px',
                                            fontWeight: '800',
                                            border: 'none',
                                            backgroundColor: matchTypeFilter === f ? '#1e1b4b' : 'white',
                                            color: matchTypeFilter === f ? 'white' : '#64748b',
                                            cursor: 'pointer',
                                            height: '34px',
                                            boxShadow: matchTypeFilter === f ? '0 8px 16px rgba(30,27,75,0.2)' : '0 2px 8px rgba(0,0,0,0.02)'
                                        }}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        )}
                        {matches.filter(m => {
                            if (matchTypeFilter === 'Regular Matches') return !m.isTournamentMatch;
                            if (matchTypeFilter === 'Tournament Matches') return m.isTournamentMatch;
                            return true;
                        }).slice(0, renderLimit).map((match, idx) => (
                            <div key={match.matchId} className={skipStagger ? 'card' : `card animate-fade-in stagger-${(idx % 10) + 1}`} style={{ padding: '16px', marginBottom: '0', display: 'flex', flexDirection: 'column', gap: '12px', border: 'none', borderRadius: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: match.matchStatus === 'live' ? '#ef4444' : '#94a3b8' }}></div>
                                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            {new Date(getMatchTimestamp(match.matchId)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date(getMatchTimestamp(match.matchId)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                            {match.endTime && (match.matchStatus === 'complete' || match.matchStatus === 'completed') && (
                                                <span style={{ color: '#4338ca', marginLeft: '8px' }}>
                                                    • {Math.round((match.endTime - (match.startTime || getMatchTimestamp(match.matchId))) / 60000)} MIN
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div
                                        onClick={() => shareScorecard(match)}
                                        style={{ padding: '8px', borderRadius: '12px', backgroundColor: '#f5f3ff', color: '#4338ca', cursor: 'pointer' }}
                                    >
                                        <Share2 size={16} strokeWidth={2.5} />
                                    </div>
                                </div>
                                {match.isTournamentMatch && (
                                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#10b981', textTransform: 'uppercase' }}>
                                        🏆 {match.tournamentName}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#1e1b4b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '13px' }}>
                                                {(match.innings?.[0]?.battingTeam || match.team1?.name || '?').charAt(0)}
                                            </div>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e1b4b' }}>{match.innings?.[0]?.battingTeam || match.team1?.name || 'Unknown'}</span>
                                        </div>
                                        <div style={{ fontWeight: '900', fontSize: '15px', color: '#1e1b4b' }}>{match.innings?.[0]?.runs ?? 0}/{match.innings?.[0]?.wickets ?? 0}</div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#1e1b4b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '13px' }}>
                                                {(match.innings?.[1]?.battingTeam || match.innings?.[0]?.bowlingTeam || match.team2?.name || '?').charAt(0)}
                                            </div>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e1b4b' }}>{match.innings?.[1]?.battingTeam || match.innings?.[0]?.bowlingTeam || match.team2?.name || 'Unknown'}</span>
                                        </div>
                                        <div style={{ fontWeight: '900', fontSize: '15px', color: '#1e1b4b' }}>{match.innings?.[1]?.runs ?? 0}/{match.innings?.[1]?.wickets ?? 0}</div>
                                    </div>
                                </div>

                                <div style={{ paddingTop: '12px', borderTop: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: (match.matchStatus === 'live' || match.matchStatus === 'innings_break') ? '#ef4444' : '#4338ca' }}>
                                            {match.matchStatus === 'live' ? '🔴 Match is LIVE' :
                                                match.matchStatus === 'innings_break' ? '🔶 Innings Break' :
                                                    match.matchStatus === 'setup' ? '⚪ Not Started' :
                                                        (match.winner === 'Tie' ? 'Match Tied' : (match.winner ? `${match.winner} won${match.winMargin ? ` by ${match.winMargin} ${match.winType}` : ''}` : 'Match Complete'))}
                                        </div>
                                    </div>
                                    {/* Action Buttons — permission-gated */}
                                    {(() => {
                                        const session = getCurrentSession();
                                        const isLive = match.matchStatus === 'live' || match.matchStatus === 'innings_break';
                                        const canEdit = canEditMatch(match, session);
                                        const canDel = canDeleteMatch(match, session);

                                        return (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                {/* Primary Action Button */}
                                                <button
                                                    onClick={() => isLive && canEdit ? resumeMatch(match) : viewScorecard(match)}
                                                    style={{
                                                        height: '36px', padding: '0 20px', fontSize: '12px',
                                                        borderRadius: '10px', border: 'none',
                                                        backgroundColor: isLive && canEdit ? '#ef4444' : '#1e1b4b',
                                                        color: 'white', fontWeight: '800', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}
                                                >
                                                    {isLive && canEdit ? 'Resume' : 'View Stats'}
                                                </button>

                                                {/* Lock badge: shown to code viewers on complete matches */}
                                                {!canEdit && !isLive && (
                                                    <div
                                                        title="View only — owner login required to edit"
                                                        style={{
                                                            height: '36px', width: '36px', padding: 0,
                                                            borderRadius: '10px', backgroundColor: '#f1f5f9',
                                                            border: 'none', display: 'flex',
                                                            alignItems: 'center', justifyContent: 'center'
                                                        }}
                                                    >
                                                        <Lock size={14} color="#94a3b8" />
                                                    </div>
                                                )}

                                                {/* Delete — only for owners */}
                                                {canDel && (
                                                    <button
                                                        onClick={() => startDeleteCountdown(match.matchId)}
                                                        style={{
                                                            height: '36px', width: '36px', padding: 0,
                                                            borderRadius: '10px', backgroundColor: '#fef2f2',
                                                            border: 'none', color: '#ef4444',
                                                            display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Issue 7: Offline data toast */}
            {offlineToast && (
                <div style={{
                    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#fef3c7', color: '#92400e',
                    padding: '10px 20px', borderRadius: '16px', fontSize: '12px', fontWeight: '800',
                    zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    border: '1px solid #fcd34d', transition: 'opacity 0.3s'
                }}>
                    📡 Using offline data
                </div>
            )}

            {/* 5-second Delete Confirmation Modal */}
            {deleteConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '20px'
                }}>
                    <div style={{
                        background: 'white', borderRadius: '24px', padding: '28px',
                        maxWidth: '320px', width: '100%', textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                        animation: 'fadeIn 0.2s ease'
                    }}>
                        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🗑️</div>
                        <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>Delete Match?</h3>
                        <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '20px', lineHeight: 1.5 }}>
                            This will permanently delete this match from <strong>all devices</strong> and cloud. Stats will be adjusted.
                        </p>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', fontSize: '22px', fontWeight: '900', color: 'white',
                            boxShadow: '0 6px 20px rgba(239,68,68,0.3)'
                        }}>
                            {deleteConfirm.countdown}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{
                                height: '4px', borderRadius: '2px', backgroundColor: '#f1f5f9', overflow: 'hidden'
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: '2px',
                                    backgroundColor: '#ef4444',
                                    width: `${(deleteConfirm.countdown / 5) * 100}%`,
                                    transition: 'width 1s linear'
                                }} />
                            </div>
                            <button
                                onClick={cancelDeleteCountdown}
                                style={{
                                    width: '100%', height: '48px', borderRadius: '14px',
                                    border: '2px solid #e2e8f0', backgroundColor: 'white',
                                    color: '#1e1b4b', fontSize: '14px', fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            

            {/* ── Maintenance Settings Bottom Sheet ─────────────────────────── */}
            {showSettingsPanel && (
                <div
                    onClick={() => setShowSettingsPanel(false)}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(15,23,42,0.55)',
                        backdropFilter: 'blur(6px)',
                        zIndex: 600,
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: '500px',
                            background: 'rgba(255, 255, 255, 0.85)',
                            backdropFilter: 'blur(24px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                            borderTop: '1px solid rgba(255,255,255,0.5)',
                            borderRadius: '28px 28px 0 0',
                            padding: '8px 20px 100px',
                            paddingBottom: 'max(100px, calc(env(safe-area-inset-bottom) + 90px))',
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.6)',
                            animation: 'slideUp 0.32s cubic-bezier(0.34,1.56,0.64,1)',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                        }}
                    >
                        {/* Handle */}
                        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#e2e8f0', margin: '12px auto 20px' }} />

                        {/* Title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Settings size={18} color="white" />
                            </div>
                            <div>
                                <div style={{ fontWeight: '900', fontSize: '16px', color: '#1e1b4b' }}>Maintenance</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>Sync fix & data recovery tools</div>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)', margin: '14px 0' }} />

                        {/* Inject touch-active CSS */}
                        <style>{`
                            .maint-btn { transition: transform 0.12s ease, box-shadow 0.12s ease; -webkit-tap-highlight-color: transparent; }
                            .maint-btn:active:not(:disabled) { transform: scale(0.972); box-shadow: 0 1px 4px rgba(0,0,0,0.10) !important; }
                            .maint-btn:disabled { opacity: 0.45 !important; cursor: not-allowed; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                            .spin { animation: spin 0.8s linear infinite; display: inline-block; }
                        `}</style>

                        {/* Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                            {/* ── Force Push to Cloud (email login only) ── */}
                            <button className="maint-btn"
                                onClick={handleForcePush}
                                disabled={!!syncActionLoading || state.loginType === 'guest'}
                                style={{
                                    width: '100%', padding: '0', borderRadius: '16px',
                                    border: 'none',
                                    boxShadow: state.loginType !== 'guest'
                                        ? '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1.5px #bfdbfe, inset 0 2px 4px rgba(255,255,255,0.8)'
                                        : '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1.5px #e2e8f0',
                                    display: 'flex', alignItems: 'stretch',
                                    cursor: state.loginType !== 'guest' ? 'pointer' : 'not-allowed',
                                    textAlign: 'left', overflow: 'hidden',
                                    background: state.loginType !== 'guest' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(248, 250, 252, 0.7)',
                                    opacity: state.loginType !== 'guest' ? 1 : 0.55,
                                }}
                            >
                                <div style={{ width: '4px', background: 'linear-gradient(180deg,#3b82f6,#1d4ed8)', flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '14px', flex: 1 }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0, boxShadow: '0 1px 3px rgba(59,130,246,0.2)' }}>☁️</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#1e3a8a' }}>Force Push to Cloud</span>
                                            {state.loginType === 'guest'
                                                ? <span style={{ fontSize: '9px', fontWeight: '700', color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1px 6px', letterSpacing: '0.5px' }}>🔒 LOGIN REQ</span>
                                                : <span style={{ fontSize: '9px', fontWeight: '700', color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '1px 6px', letterSpacing: '0.5px' }}>CAUTION</span>
                                            }
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '500' }}>
                                            {state.loginType === 'guest' ? 'Sign in to use this feature' : "Overwrite cloud with this device's local data"}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '18px', color: '#94a3b8', flexShrink: 0 }}>{syncActionLoading === 'push' ? <span className="spin">⟳</span> : '›'}</div>
                                </div>
                            </button>

                            {/* ── Emergency Data Recovery ── */}
                            <button className="maint-btn"
                                onClick={handleForceFullRecovery}
                                disabled={!!syncActionLoading}
                                style={{
                                    width: '100%', padding: '0', borderRadius: '16px',
                                    border: 'none', background: 'rgba(255, 255, 255, 0.7)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1.5px #fcd34d, inset 0 2px 4px rgba(255,255,255,0.8)',
                                    display: 'flex', alignItems: 'stretch', cursor: 'pointer',
                                    textAlign: 'left', overflow: 'hidden',
                                }}
                            >
                                <div style={{ width: '4px', background: 'linear-gradient(180deg,#f59e0b,#d97706)', flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '14px', flex: 1 }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0, boxShadow: '0 1px 3px rgba(245,158,11,0.2)' }}>⚕️</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#92400e' }}>Force Full Data Recovery</span>
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '500' }}>Recover completely missing or broken matches</div>
                                    </div>
                                    <div style={{ fontSize: '18px', color: '#94a3b8', flexShrink: 0 }}>{syncActionLoading === 'full-recovery' ? <span className="spin">⟳</span> : '›'}</div>
                                </div>
                            </button>

                            {/* ── Empty Trash ── */}
                            <button className="maint-btn"
                                onClick={handleEmptyTrash}
                                disabled={!!syncActionLoading}
                                style={{
                                    width: '100%', padding: '0', borderRadius: '16px',
                                    border: 'none', background: 'rgba(255, 255, 255, 0.7)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1.5px #ef4444, inset 0 2px 4px rgba(255,255,255,0.8)',
                                    display: 'flex', alignItems: 'stretch', cursor: 'pointer',
                                    textAlign: 'left', overflow: 'hidden',
                                }}
                            >
                                <div style={{ width: '4px', background: 'linear-gradient(180deg,#dc2626,#991b1b)', flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '14px', flex: 1 }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0, boxShadow: '0 1px 3px rgba(220,38,38,0.2)' }}>🗑️</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#7f1d1d' }}>Empty Cloud Trash</span>
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '500' }}>Permanently wipe deleted matches</div>
                                    </div>
                                    <div style={{ fontSize: '18px', color: '#94a3b8', flexShrink: 0 }}>{syncActionLoading === 'empty-trash' ? <span className="spin">⟳</span> : '›'}</div>
                                </div>
                            </button>

                            {/* ── Hard Reset & Fetch Cloud ── */}
                            <button className="maint-btn"
                                onClick={handleHardReset}
                                disabled={!!syncActionLoading}
                                style={{
                                    width: '100%', padding: '0', borderRadius: '16px',
                                    border: 'none', background: 'rgba(255, 255, 255, 0.7)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 0 0 1.5px #fca5a5, inset 0 2px 4px rgba(255,255,255,0.8)',
                                    display: 'flex', alignItems: 'stretch', cursor: 'pointer',
                                    textAlign: 'left', overflow: 'hidden',
                                }}
                            >
                                <div style={{ width: '4px', background: 'linear-gradient(180deg,#ef4444,#b91c1c)', flexShrink: 0 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '14px', flex: 1 }}>
                                    <div style={{ width: '42px', height: '42px', borderRadius: '13px', background: 'linear-gradient(135deg,#fff1f2,#fee2e2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0, boxShadow: '0 1px 3px rgba(239,68,68,0.2)' }}>🔄</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#7f1d1d' }}>Hard Reset & Fetch Cloud</span>
                                            <span style={{ fontSize: '9px', fontWeight: '700', color: '#dc2626', background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '1px 6px', letterSpacing: '0.5px' }}>DANGER</span>
                                        </div>
                                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '500' }}>Wipe local data — re-sync everything from cloud</div>
                                    </div>
                                    <div style={{ fontSize: '18px', color: '#94a3b8', flexShrink: 0 }}>{syncActionLoading === 'reset' ? <span className="spin">⟳</span> : '›'}</div>
                                </div>
                            </button>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default History;
