import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { db, rtdb } from '../firebase';
import { doc, setDoc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, set as rsSet, remove as rsRemove } from 'firebase/database';
import { openDB } from 'idb';
import { clearMatchCache, fetchRecentPlayers, getUserScope, guardActivePush } from '../utils/dataFetcher';
import { saveNameToStorage, saveMultipleNamesToStorage, removeNameFromStorage } from '../utils/nameStorage';
import { processedBatsmen } from '../utils/soundPlayer';

const MatchContext = createContext();

const idbPromise = openDB('CricScorerDB', 1, {
    upgrade(db) {
        db.createObjectStore('matches');
        db.createObjectStore('settings');
    },
});

const initialState = {
    matchId: null,
    loginType: null, // guest, google, shareable
    userCode: null,
    userName: null,
    ownerName: null,
    team1: { name: '', score: 0, wickets: 0, overs: 0, balls: 0 },
    team2: { name: '', score: 0, wickets: 0, overs: 0, balls: 0 },
    tossWinner: '',
    batFirst: '',
    totalOvers: 0,
    playersPerTeam: 11,
    settings: {
        showNoBall: false,
        noBallEnabled: false,
        noBallRuns: 1,
        noBallReball: false,
        freehitEnabled: false,
        showWideBall: false,
        wideBallEnabled: false,
        wideBallRuns: 1,
        wideBallReball: false,
        byesEnabled: false,
        legByesEnabled: false,
    },
    currentInnings: 1,
    innings: [
        {
            battingTeam: '',
            bowlingTeam: '',
            runs: 0,
            wickets: 0,
            balls: 0,
            overs: 0,
            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
            batsmen: [],
            bowlers: [],
            partnerships: [],
            fallOfWickets: [],
            timeline: [],
            thisOver: [],
            overTimestamps: [],
        },
        {
            battingTeam: '',
            bowlingTeam: '',
            runs: 0,
            wickets: 0,
            balls: 0,
            overs: 0,
            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
            batsmen: [],
            bowlers: [],
            partnerships: [],
            fallOfWickets: [],
            timeline: [],
            thisOver: [],
            overTimestamps: [],
        }
    ],
    target: null,
    isFreehitNext: false,
    matchStatus: 'setup', // setup, live, innings_break, complete
    winner: null,
    winMargin: null,
    winType: null,
    manOfMatch: { name: '', points: 0 },
    syncStatus: 'synced', // synced, syncing, pending
    startTime: null,
    endTime: null,
    lastOverBowler: null,
};

const sanitizeString = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '').trim(); // Remove basic HTML tags to prevent XSS
};

const validateMatchState = (s) => {
    if (!s) return initialState;
    const validated = { ...initialState, ...s };

    // Sanitize high level strings
    validated.team1 = {
        ...initialState.team1,
        ...s.team1,
        name: sanitizeString(s.team1?.name)
    };
    validated.team2 = {
        ...initialState.team2,
        ...s.team2,
        name: sanitizeString(s.team2?.name)
    };
    validated.tossWinner = sanitizeString(s.tossWinner);
    validated.batFirst = sanitizeString(s.batFirst);
    if (s.manOfMatch) {
        validated.manOfMatch = { ...s.manOfMatch, name: sanitizeString(s.manOfMatch.name) };
    }
    validated.settings = { ...initialState.settings, ...s.settings };
    if (s.settings && s.settings.showNoBall === undefined) {
        validated.settings.showNoBall = !!s.settings.noBallEnabled;
    }
    if (s.settings && s.settings.showWideBall === undefined) {
        validated.settings.showWideBall = !!s.settings.wideBallEnabled;
    }

    // Core numbers and list loops
    validated.innings = (Array.isArray(s.innings) ? s.innings : initialState.innings).map(inn => ({
        battingTeam: sanitizeString(inn?.battingTeam),
        bowlingTeam: sanitizeString(inn?.bowlingTeam),
        runs: Number(inn?.runs) || 0,
        wickets: Number(inn?.wickets) || 0,
        balls: Number(inn?.balls) || 0,
        overs: Number(inn?.overs) || 0,
        extras: {
            byes: Number(inn?.extras?.byes || inn?.extras?.bye) || 0,
            legByes: Number(inn?.extras?.legByes || inn?.extras?.legBye) || 0,
            wides: Number(inn?.extras?.wides || inn?.extras?.wide) || 0,
            noBalls: Number(inn?.extras?.noBalls || inn?.extras?.noBall) || 0,
            penalty: Number(inn?.extras?.penalty) || 0,
        },
        batsmen: (Array.isArray(inn?.batsmen) ? inn.batsmen : []).map(b => ({
            ...b,
            name: sanitizeString(b.name),
            dismissalText: sanitizeString(b.dismissalText)
        })),
        bowlers: (Array.isArray(inn?.bowlers) ? inn.bowlers : []).map(b => ({
            ...b,
            name: sanitizeString(b.name)
        })),
        timeline: Array.isArray(inn?.timeline || inn?.ballLog) ? (inn.timeline || inn.ballLog) : [],
        thisOver: Array.isArray(inn?.thisOver) ? inn.thisOver : [],
        partnerships: Array.isArray(inn?.partnerships) ? inn.partnerships : [],
        fallOfWickets: Array.isArray(inn?.fallOfWickets) ? inn.fallOfWickets : [],
        overTimestamps: Array.isArray(inn?.overTimestamps) ? inn.overTimestamps : [],
        currentBowlerName: sanitizeString(inn?.currentBowlerName),
    }));

    validated.currentInnings = Number(s.currentInnings) || 1;
    validated.target = s.target !== undefined ? Number(s.target) : 0;
    validated.matchStatus = s.matchStatus || 'setup';

    return validated;
};

// Strip heavy fields that are redundant before syncing to Firestore.
// `wagonData` on batsmen duplicates what is already stored as `ball.zone` on each timeline entry.
// Removing it prevents Firestore document size limit failures that silently lose wagon wheel data.
const stripHeavyFields = (state) => {
    if (!state.innings) return state;
    return {
        ...state,
        innings: state.innings.map(inn => {
            if (!inn || !inn.batsmen) return inn;
            return {
                ...inn,
                batsmen: inn.batsmen.map(b => {
                    const { wagonData, ...rest } = b;
                    return rest;
                })
            };
        })
    };
};

export const syncToFirestore = async (s) => {
    if (!s.matchId || s.loginType === 'guest') return;

    try {
        const now = Date.now();
        if ((s.loginType === 'shareable' || s.loginType === 'code') && s.userCode) {
            const { history, ...rawState } = s;
            const stateToSync = stripHeavyFields(rawState);
            stateToSync.deleted = false;
            stateToSync.deletedAt = null;          // Clear any stale tombstone
            stateToSync.updatedAt = now;           // LWW primary timestamp
            stateToSync.lastUpdated = now;         // Legacy compat
            stateToSync.createdAt = s.createdAt || s.startTime || now; // Set once

            // Anti-resurrection guard: if the owner has tombstoned this match in the cloud,
            // abort the entire sync for it — do NOT re-upload, broadcast to RTDB, or aggregate
            // stats. guardActivePush also purges it locally and records the id in deleted_matches
            // so this device stops trying. This is what stops the delete → re-upload loop.
            if (s.matchId) {
                const guardRef = doc(db, 'shareLogins', s.userCode, 'matches', s.matchId);
                const okToPush = await guardActivePush(guardRef, s.matchId, getUserScope(s));
                if (!okToPush) return;
            }

            console.log(`[Sync] syncToFirestore (shareable): ${s.matchId}, updatedAt=${now}`);
            const docRef = doc(db, 'shareLogins', s.userCode);
            await setDoc(docRef, {
                currentMatch: stateToSync,
                lastUpdated: new Date()
            }, { merge: true });

            if (s.matchId) {
                // Ensure the match actually saves historically
                const matchDocRef = doc(db, 'shareLogins', s.userCode, 'matches', s.matchId);
                await setDoc(matchDocRef, stateToSync); // Full overwrite - ensures renames replace stale data

                // LIVE BROADCAST to RTDB for Watch-Live feature
                if (s.matchStatus === 'live' || s.matchStatus === 'innings_break') {
                    const liveRef = ref(rtdb, `live/${s.userCode.toUpperCase()}`);
                    rsSet(liveRef, { matchState: stateToSync, lastUpdated: Date.now() }).catch(() => { });
                    // Update profile isLive flag
                    setDoc(doc(db, 'shareLogins', s.userCode), { isLive: true }, { merge: true }).catch(() => { });
                } else if (s.matchStatus === 'complete' || s.matchStatus === 'abandoned') {
                    // Remove from live when finished
                    const liveRef = ref(rtdb, `live/${s.userCode.toUpperCase()}`);
                    rsRemove(liveRef).catch(() => { });
                    setDoc(doc(db, 'shareLogins', s.userCode), { isLive: false }, { merge: true }).catch(() => { });
                }
            }

            if (s.matchStatus === 'complete' && !s.statsSynced) {
                const docSnap = await getDoc(docRef);
                const existingPlayers = docSnap.exists() ? (docSnap.data().players || {}) : {};
                const updatedPlayers = { ...existingPlayers };
                s.innings.forEach(inn => {
                    inn.batsmen.forEach(b => {
                        const bName = b.name?.trim()?.toUpperCase();
                        if (!bName) return;
                        if (!updatedPlayers[bName]) updatedPlayers[bName] = { runs: 0, balls: 0, matches: 0, wickets: 0 };
                        updatedPlayers[bName].runs += (b.runs || 0);
                        updatedPlayers[bName].balls += (b.balls || 0);
                        updatedPlayers[bName].matches += 1;
                    });
                    inn.bowlers.forEach(b => {
                        const bName = b.name?.trim()?.toUpperCase();
                        if (!bName) return;
                        if (!updatedPlayers[bName]) updatedPlayers[bName] = { runs: 0, balls: 0, matches: 0, wickets: 0 };
                        updatedPlayers[bName].wickets += (b.wickets || 0);
                    });
                });
                await setDoc(docRef, { players: updatedPlayers }, { merge: true });

                // Mark stats as synced to avoid double counting
                const matchDocRef = doc(db, 'shareLogins', s.userCode, 'matches', s.matchId);
                await updateDoc(matchDocRef, { statsSynced: true });
                s.statsSynced = true; // Local update too
            }
        } else if (s.loginType === 'google' && s.userCode) {
            const { history, ...rawState } = s;
            const stateToSync = stripHeavyFields(rawState);
            stateToSync.deleted = false;
            stateToSync.deletedAt = null;          // Clear any stale tombstone
            stateToSync.updatedAt = now;           // LWW primary timestamp
            stateToSync.lastUpdated = now;         // Legacy compat
            stateToSync.createdAt = s.createdAt || s.startTime || now; // Set once

            // Anti-resurrection guard (owner side): if this match is tombstoned in the cloud,
            // don't let an active auto-sync bring it back — this aborts the googleUsers write AND
            // both shareLogins mirror writes below. Explicit owner restore
            // (restoreAllTombstonedMatches / forceFullDataRecovery) writes directly and clears
            // deleted_matches, so recovery is unaffected by this guard.
            if (s.matchId) {
                const guardRef = doc(db, 'googleUsers', s.userCode, 'matches', s.matchId);
                const okToPush = await guardActivePush(guardRef, s.matchId, getUserScope(s));
                if (!okToPush) return;
            }

            console.log(`[Sync] syncToFirestore (google): ${s.matchId}, updatedAt=${now}`);
            const docRef = doc(db, 'googleUsers', s.userCode);
            await setDoc(docRef, {
                currentMatch: stateToSync,
                lastUpdated: new Date()
            }, { merge: true });

            if (s.matchId) {
                // Ensure the match saves historically
                const matchDocRef = doc(db, 'googleUsers', s.userCode, 'matches', s.matchId);
                await setDoc(matchDocRef, stateToSync); // Full overwrite - ensures renames replace stale data

                // For code viewers, instantly mirror the update to shareLogins
                try {
                    const codeSnap = await getDoc(doc(db, 'userCodes', s.userCode));
                    if (codeSnap.exists() && codeSnap.data()?.code) {
                        const code = codeSnap.data().code;
                        await setDoc(doc(db, 'shareLogins', code, 'matches', s.matchId), stateToSync);
                    }
                } catch (e) { }
            }

            if (s.matchStatus === 'complete' && !s.statsSynced) {
                const docSnap = await getDoc(docRef);
                const existingPlayers = docSnap.exists() ? (docSnap.data().players || {}) : {};
                const updatedPlayers = { ...existingPlayers };
                s.innings.forEach(inn => {
                    inn.batsmen.forEach(b => {
                        const bName = b.name?.trim()?.toUpperCase();
                        if (!bName) return;
                        if (!updatedPlayers[bName]) updatedPlayers[bName] = { runs: 0, balls: 0, matches: 0, wickets: 0 };
                        updatedPlayers[bName].runs += (b.runs || 0);
                        updatedPlayers[bName].balls += (b.balls || 0);
                        updatedPlayers[bName].matches += 1;
                    });
                    inn.bowlers.forEach(b => {
                        const bName = b.name?.trim()?.toUpperCase();
                        if (!bName) return;
                        if (!updatedPlayers[bName]) updatedPlayers[bName] = { runs: 0, balls: 0, matches: 0, wickets: 0 };
                        updatedPlayers[bName].wickets += (b.wickets || 0);
                    });
                });
                await setDoc(docRef, { players: updatedPlayers }, { merge: true });

                // Mark stats as synced
                const matchDocRef = doc(db, 'googleUsers', s.userCode, 'matches', s.matchId);
                await updateDoc(matchDocRef, { statsSynced: true });
                s.statsSynced = true; // Local update too
            }

            // CRITICAL FIX: Also mirror output to shareLogins so code viewers can follow the live score and history.
            try {
                const codeSnap = await getDoc(doc(db, 'userCodes', s.userCode));
                if (codeSnap.exists() && codeSnap.data()?.code) {
                    const shortCode = codeSnap.data().code;
                    const shareDocRef = doc(db, 'shareLogins', shortCode);
                    await setDoc(shareDocRef, {
                        currentMatch: stateToSync,
                        lastUpdated: new Date()
                    }, { merge: true });

                    if (s.matchId) {
                        const shareMatchDocRef = doc(db, 'shareLogins', shortCode, 'matches', s.matchId);
                        await setDoc(shareMatchDocRef, stateToSync);

                        // LIVE BROADCAST to RTDB
                        if (s.matchStatus === 'live' || s.matchStatus === 'innings_break') {
                            const liveRef = ref(rtdb, `live/${shortCode.toUpperCase()}`);
                            rsSet(liveRef, { matchState: stateToSync, lastUpdated: Date.now() }).catch(() => { });
                            setDoc(shareDocRef, { isLive: true }, { merge: true }).catch(() => { });
                        } else if (s.matchStatus === 'complete' || s.matchStatus === 'abandoned') {
                            const liveRef = ref(rtdb, `live/${shortCode.toUpperCase()}`);
                            rsRemove(liveRef).catch(() => { });
                            setDoc(shareDocRef, { isLive: false }, { merge: true }).catch(() => { });
                        }
                    }
                }
            } catch (e) { }
        }
    } catch (e) {
        console.error("Firestore Error:", e);
    }
};

const evaluateMatchStatus = (newState) => {
    const items = newState.innings[newState.currentInnings - 1];
    if (!items) return newState;
    const playersPerTeam = newState.playersPerTeam || 11;
    const totalOvers = newState.totalOvers || 0;
    const target = newState.target || 0;

    const isSuperOver = newState.currentInnings > 2;
    const wicketLimit = isSuperOver ? 2 : (playersPerTeam - 1);

    const isInnings1 = (newState.currentInnings % 2) !== 0; // Inn 1, 3 (Super Over 1st Inning)
    const isInnings2 = (newState.currentInnings % 2) === 0; // Inn 2, 4 (Super Over 2nd Inning)

    if (isInnings1) {
        if (items.wickets >= wicketLimit || (totalOvers > 0 && items.balls >= totalOvers * 6)) {
            newState.matchStatus = 'innings_break';
        }
    } else if (isInnings2) {
        if (items.runs >= target) {
            newState.matchStatus = 'complete';
            newState.winner = items.battingTeam;
            newState.winType = 'wickets';
            newState.winMargin = (playersPerTeam - items.wickets - 1);
        } else if (items.wickets >= wicketLimit || (totalOvers > 0 && items.balls >= totalOvers * 6)) {
            newState.matchStatus = 'complete';
            if (items.runs < target - 1) {
                newState.winner = newState.innings[newState.currentInnings - 2]?.battingTeam; // accurately grabs 1st inn in pair
                newState.winType = 'runs';
                newState.winMargin = (target - 1 - items.runs);
            } else {
                newState.winner = 'Tie';
                newState.winMargin = 0;
                newState.winType = '';
            }
        }
    }

    if (newState.matchStatus === 'complete') {
        if (!newState.endTime) newState.endTime = Date.now();
        newState.manOfMatch = calculateDetailedMOTM(newState.innings, newState.winner);
    }

    return newState;
};

export const calculateDetailedMOTM = (innings, winner) => {
    const players = {};
    const initPlayer = (name, teamName) => {
        const key = name ? name.trim().toUpperCase() : 'UNKNOWN';
        if (!players[key]) {
            players[key] = {
                name: name ? name.trim() : 'Unknown',
                teamName: teamName || '',
                totalPts: 0,
                batting: { runs: 0, balls: 0, fours: 0, sixes: 0, pts: 0, breakdown: [] },
                bowling: { overs: 0, runs: 0, wickets: 0, maidens: 0, pts: 0, breakdown: [] },
                fielding: { catches: 0, stumpings: 0, runOuts: 0, pts: 0, breakdown: [] }
            };
        } else if (teamName && !players[key].teamName) {
            players[key].teamName = teamName;
        }
        return key;
    };

    innings.forEach((inn) => {
        if (!inn) return;
        
        const battingTeam = inn.battingTeam;
        const bowlingTeam = inn.bowlingTeam;

        inn.batsmen.forEach((b, idx) => {
            const key = initPlayer(b.name, battingTeam);
            const p = players[key];
            p.batting.runs += (b.runs || 0);
            p.batting.balls += (b.balls || 0);
            p.batting.fours += (b.fours || 0);
            p.batting.sixes += (b.sixes || 0);
            if (idx < 2) p.batting.isOpener = true;

            if (b.fielderName) {
                const fKey = initPlayer(b.fielderName, bowlingTeam);
                if (b.dismissalType === 'caught') players[fKey].fielding.catches++;
                if (b.dismissalType === 'stumped') players[fKey].fielding.stumpings++;
                if (b.dismissalType === 'runout') players[fKey].fielding.runOuts++;
            }
        });

        inn.bowlers.forEach(b => {
            const key = initPlayer(b.name, bowlingTeam);
            const p = players[key];
            p.bowling.overs += (b.overs || 0);
            p.bowling.runs += (b.runs || 0);
            p.bowling.wickets += (b.wickets || 0);
            p.bowling.maidens += (b.maidens || 0);
        });
    });

    Object.values(players).forEach(p => {
        if (p.batting.balls > 0) {
            let bPts = p.batting.runs;
            if (p.batting.runs > 0) p.batting.breakdown.push({ text: `${p.batting.runs} runs`, pts: p.batting.runs });

            if (p.batting.fours > 0) {
                bPts += p.batting.fours * 3;
                p.batting.breakdown.push({ text: `${p.batting.fours} fours`, pts: p.batting.fours * 3 });
            }
            if (p.batting.sixes > 0) {
                bPts += p.batting.sixes * 6;
                p.batting.breakdown.push({ text: `${p.batting.sixes} sixes`, pts: p.batting.sixes * 6 });
            }

            if (p.batting.runs >= 50) { bPts += 50; p.batting.breakdown.push({ text: `50+ milestone`, pts: 50 }); }
            else if (p.batting.runs >= 40) { bPts += 30; p.batting.breakdown.push({ text: `40-49 milestone`, pts: 30 }); }
            else if (p.batting.runs >= 30) { bPts += 20; p.batting.breakdown.push({ text: `30-39 milestone`, pts: 20 }); }
            else if (p.batting.runs >= 20) { bPts += 10; p.batting.breakdown.push({ text: `20-29 milestone`, pts: 10 }); }

            if (p.batting.balls >= 6) {
                const sr = (p.batting.runs / p.batting.balls) * 100;
                if (sr > 200) { bPts += 20; p.batting.breakdown.push({ text: `SR > 200 bonus`, pts: 20 }); }
                else if (sr >= 150) { bPts += 10; p.batting.breakdown.push({ text: `SR 150-199 bonus`, pts: 10 }); }
                else if (sr < 100) { bPts -= 10; p.batting.breakdown.push({ text: `SR < 100 penalty`, pts: -10 }); }
            }

            if (p.batting.isOpener && p.batting.runs >= 15) {
                bPts += 10; p.batting.breakdown.push({ text: `Opener 15+ runs`, pts: 10 });
            }
            p.batting.pts = bPts;
        }

        if (p.bowling.overs > 0 || p.bowling.wickets > 0) {
            let bwPts = 0;
            if (p.bowling.wickets > 0) {
                bwPts += p.bowling.wickets * 30;
                p.bowling.breakdown.push({ text: `${p.bowling.wickets} wickets`, pts: p.bowling.wickets * 30 });

                if (p.bowling.wickets >= 4) { bwPts += 70; p.bowling.breakdown.push({ text: `4+ wkts bonus`, pts: 70 }); }
                else if (p.bowling.wickets === 3) { bwPts += 40; p.bowling.breakdown.push({ text: `3 wkts bonus`, pts: 40 }); }
                else if (p.bowling.wickets === 2) { bwPts += 20; p.bowling.breakdown.push({ text: `2 wkts bonus`, pts: 20 }); }
            }

            let fullyBowledOvers = Math.floor(p.bowling.overs) + ((p.bowling.overs % 1) * 10 / 6);
            if (fullyBowledOvers >= 1) {
                const eco = p.bowling.runs / fullyBowledOvers;
                if (eco < 4) { bwPts += 25; p.bowling.breakdown.push({ text: `Eco < 4 bonus`, pts: 25 }); }
                else if (eco < 5) { bwPts += 15; p.bowling.breakdown.push({ text: `Eco 4-5 bonus`, pts: 15 }); }
                else if (eco < 6) { bwPts += 10; p.bowling.breakdown.push({ text: `Eco 5-6 bonus`, pts: 10 }); }
                else if (eco > 8) { bwPts -= 10; p.bowling.breakdown.push({ text: `Eco > 8 penalty`, pts: -10 }); }
            }

            if (p.bowling.maidens && p.bowling.maidens > 0) {
                bwPts += p.bowling.maidens * 15;
                p.bowling.breakdown.push({ text: `${p.bowling.maidens} maiden(s)`, pts: p.bowling.maidens * 15 });
            }
            p.bowling.pts = bwPts;
        }

        let fPts = 0;
        if (p.fielding.catches > 0) { fPts += p.fielding.catches * 15; p.fielding.breakdown.push({ text: `${p.fielding.catches} catch`, pts: p.fielding.catches * 15 }); }
        if (p.fielding.stumpings > 0) { fPts += p.fielding.stumpings * 20; p.fielding.breakdown.push({ text: `${p.fielding.stumpings} stump`, pts: p.fielding.stumpings * 20 }); }
        if (p.fielding.runOuts > 0) { fPts += p.fielding.runOuts * 20; p.fielding.breakdown.push({ text: `${p.fielding.runOuts} run out`, pts: p.fielding.runOuts * 20 }); }
        p.fielding.pts = fPts;

        p.totalPts = p.batting.pts + p.bowling.pts + p.fielding.pts;
    });

    let best = null;
    const hasWinner = winner && winner !== 'Tie' && winner !== 'TBA';

    if (hasWinner) {
        const winningTeamUpper = winner.trim().toUpperCase();
        Object.values(players).forEach(p => {
            if (!p.teamName || p.teamName.trim().toUpperCase() !== winningTeamUpper) return;

            if (!best) { best = p; return; }
            if (p.totalPts > best.totalPts) {
                best = p;
            } else if (p.totalPts === best.totalPts) {
                if (p.bowling.wickets > best.bowling.wickets) {
                    best = p;
                } else if (p.bowling.wickets === best.bowling.wickets) {
                    if (p.batting.runs > best.batting.runs) {
                        best = p;
                    } else if (p.batting.runs === best.batting.runs) {
                        let pSR = p.batting.balls > 0 ? (p.batting.runs / p.batting.balls) : 0;
                        let bSR = best.batting.balls > 0 ? (best.batting.runs / best.batting.balls) : 0;
                        if (pSR > bSR) best = p;
                    }
                }
            }
        });
    }

    if (!best) {
        Object.values(players).forEach(p => {
            if (!best) { best = p; return; }
            if (p.totalPts > best.totalPts) {
                best = p;
            } else if (p.totalPts === best.totalPts) {
                if (p.bowling.wickets > best.bowling.wickets) {
                    best = p;
                } else if (p.bowling.wickets === best.bowling.wickets) {
                    if (p.batting.runs > best.batting.runs) {
                        best = p;
                    } else if (p.batting.runs === best.batting.runs) {
                        let pSR = p.batting.balls > 0 ? (p.batting.runs / p.batting.balls) : 0;
                        let bSR = best.batting.balls > 0 ? (best.batting.runs / best.batting.balls) : 0;
                        if (pSR > bSR) best = p;
                    }
                }
            }
        });
    }

    return best || { name: 'TBA', totalPts: 0, batting: {}, bowling: {}, fielding: {} };
};

function matchReducerRaw(state, action) {
    switch (action.type) {
        case 'INIT_MATCH':
            try { processedBatsmen.clear(); } catch (e) { }
            return {
                ...initialState,
                ...action.payload,
                loginType: state.loginType,
                userCode: state.userCode
            };

        case 'UPDATE_STATE': {
            const sessionKeys = {};
            if (state.loginType) sessionKeys.loginType = state.loginType;
            if (state.userCode) sessionKeys.userCode = state.userCode;
            if (state.userName) sessionKeys.userName = state.userName;
            if (state.ownerName) sessionKeys.ownerName = state.ownerName;
            if (state.ownerEmail) sessionKeys.ownerEmail = state.ownerEmail;

            const newState = { ...state, ...action.payload, ...sessionKeys };
            return validateMatchState(evaluateMatchStatus(newState));
        }

        case 'START_SUPER_OVER': {
            const superOverInnings = [
                {
                    battingTeam: state.innings[1]?.battingTeam || state.team2?.name,
                    bowlingTeam: state.innings[0]?.battingTeam || state.team1?.name,
                    runs: 0, wickets: 0, balls: 0, overs: 0,
                    extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                    batsmen: [], bowlers: [], partnerships: [], fallOfWickets: [], timeline: [], thisOver: [], overTimestamps: []
                },
                {
                    battingTeam: state.innings[0]?.battingTeam || state.team1?.name,
                    bowlingTeam: state.innings[1]?.battingTeam || state.team2?.name,
                    runs: 0, wickets: 0, balls: 0, overs: 0,
                    extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                    batsmen: [], bowlers: [], partnerships: [], fallOfWickets: [], timeline: [], thisOver: [], overTimestamps: []
                }
            ];
            return {
                ...state,
                totalOvers: 1,
                currentInnings: state.currentInnings + 1,
                innings: [...state.innings, ...superOverInnings],
                matchStatus: 'live',
                winner: null,
                target: null // Reset target for recalculation on next inn transition
            };
        }

        case 'SET_SYNC_STATUS':
            return { ...state, syncStatus: action.payload };

        case 'EDIT_TIMELINE_BALL': {
            const { innIdx, timelineIdx, newRuns } = action.payload;
            const newInnings = [...state.innings];
            const inn = { ...newInnings[innIdx] };
            if (!inn || !inn.timeline || !inn.timeline[timelineIdx]) return state;

            const newTimeline = [...inn.timeline];
            const ball = { ...newTimeline[timelineIdx] };
            
            const oldRuns = ball.runs || 0;
            const diff = newRuns - oldRuns;
            if (diff === 0) return state; // No change

            // Only allow editing runs for normal balls right now
            if (ball.isWicket || ball.isWide || ball.isNoBall || ball.isBye || ball.isLegBye) {
                console.warn('Cannot edit extras or wickets yet via this UI');
                return state;
            }

            ball.runs = newRuns;
            newTimeline[timelineIdx] = ball;
            inn.timeline = newTimeline;
            
            inn.runs = (inn.runs || 0) + diff;

            const newBatsmen = [...inn.batsmen];
            const bIdx = newBatsmen.findIndex(b => b.name === ball.batsmanName);
            if (bIdx !== -1) {
                const batsman = { ...newBatsmen[bIdx] };
                batsman.runs = (batsman.runs || 0) + diff;
                if (oldRuns === 4) batsman.fours = Math.max(0, (batsman.fours || 0) - 1);
                if (oldRuns === 6) batsman.sixes = Math.max(0, (batsman.sixes || 0) - 1);
                if (newRuns === 4) batsman.fours = (batsman.fours || 0) + 1;
                if (newRuns === 6) batsman.sixes = (batsman.sixes || 0) + 1;
                newBatsmen[bIdx] = batsman;
            }
            inn.batsmen = newBatsmen;

            const newBowlers = [...inn.bowlers];
            const bwIdx = newBowlers.findIndex(b => b.name === ball.bowlerName);
            if (bwIdx !== -1) {
                const bowler = { ...newBowlers[bwIdx] };
                bowler.runs = (bowler.runs || 0) + diff;
                newBowlers[bwIdx] = bowler;
            }
            inn.bowlers = newBowlers;

            newInnings[innIdx] = inn;

            return {
                ...state,
                innings: newInnings
            };
        }

        case 'ADD_BALL': {
            let { ball } = action.payload;
            if (!ball) return state;

            // Strict Type Coercion to prevent injection or invalid state corruption
            ball = {
                ...ball,
                runs: Number(ball.runs) || 0,
                extras: Number(ball.extras) || 0,
                isWide: Boolean(ball.isWide),
                isNoBall: Boolean(ball.isNoBall),
                isBye: Boolean(ball.isBye),
                isLegBye: Boolean(ball.isLegBye),
                isWicket: Boolean(ball.isWicket)
            };

            const currentIdx = state.currentInnings - 1;
            if (currentIdx < 0 || !state.innings[currentIdx]) return state;

            const newInnings = [...state.innings];
            const items = { ...newInnings[currentIdx] };
            newInnings[currentIdx] = items;

            // Clone sub-objects that will be modified
            items.extras = { ...items.extras };
            items.batsmen = [...items.batsmen];
            items.bowlers = [...items.bowlers];
            items.timeline = [...(items.timeline || [])];
            items.thisOver = [...(items.thisOver || [])];

            // Update basic stats
            items.runs = (items.runs || 0) + (ball.runs || 0) + (ball.extras || 0);
            if (!ball.isWide && !ball.isNoBall) {
                items.balls = (items.balls || 0) + 1;
                items.overs = Math.floor(items.balls / 6) + (items.balls % 6) / 10;
            }

            // Update extras
            if (ball.extraType === 'wide') items.extras.wides += (ball.extras || 0);
            if (ball.extraType === 'noBall') items.extras.noBalls += (ball.extras || 0);
            if (ball.extraType === 'bye') items.extras.byes += (ball.runs || 0);
            if (ball.extraType === 'legBye') items.extras.legByes += (ball.runs || 0);

            // Update batsman stats
            const strikerIdx = items.batsmen.findIndex(b => b.isStriker);
            if (strikerIdx !== -1) {
                const striker = { ...items.batsmen[strikerIdx] };
                items.batsmen[strikerIdx] = striker;

                if (!ball.isBye && !ball.isLegBye && !ball.isWide) {
                    striker.runs = (striker.runs || 0) + (ball.runs || 0);
                    striker.balls = (striker.balls || 0) + 1;
                    if (ball.runs === 4) striker.fours = (striker.fours || 0) + 1;
                    if (ball.runs === 6) striker.sixes = (striker.sixes || 0) + 1;
                }

                // Track Wagon Data
                const zone = ball.zone || ball.wagonZone;
                if (zone) {
                    striker.wagonData = [...(striker.wagonData || []), {
                        zone,
                        runs: ball.runs || 0,
                        ballNum: items.balls,
                        timestamp: Date.now()
                    }];
                }
            }

            // Update bowler stats
            const bowlerIdx = items.bowlers.findIndex(b => b.name === ball.bowlerName);
            if (bowlerIdx !== -1) {
                const bowler = { ...items.bowlers[bowlerIdx] };
                items.bowlers[bowlerIdx] = bowler;

                if (!ball.isWide && !ball.isNoBall) {
                    const totalBalls = Math.round(Math.floor(bowler.overs || 0) * 6 + ((bowler.overs || 0) % 1) * 10) + 1;
                    bowler.overs = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;
                }
                if (!ball.isBye && !ball.isLegBye) {
                    bowler.runs = (bowler.runs || 0) + (ball.runs || 0) + (ball.isWide || ball.isNoBall ? (ball.extras || 0) : 0);
                }
                if (ball.runs === 4) bowler.fours = (bowler.fours || 0) + 1;
                if (ball.runs === 6) bowler.sixes = (bowler.sixes || 0) + 1;
            }

            const finalBall = {
                ...ball,
                timestamp: ball.timestamp || Date.now(),
                batsmanName: ball.batsmanName || items.batsmen.find(b => b.isStriker)?.name || 'Unknown',
                bowlerName: ball.bowlerName || items.bowlers[items.bowlers.length - 1]?.name || 'Unknown'
            };

            items.timeline.push(finalBall);
            items.thisOver.push(finalBall);

            // Record Over Completion Time
            const legalBallsInOver = items.thisOver.filter(b => !b.isWide && !b.isNoBall).length;
            if (legalBallsInOver === 6) {
                const runsInOver = items.thisOver.reduce((sum, b) => sum + (b.runs || 0) + (b.isWide || b.isNoBall ? 1 : 0), 0);
                if (runsInOver === 0) {
                    const bIdx = items.bowlers.findIndex(b => b.name === ball.bowlerName);
                    if (bIdx !== -1) {
                        items.bowlers[bIdx] = { ...items.bowlers[bIdx], maidens: (items.bowlers[bIdx].maidens || 0) + 1 };
                    }
                }

                if (!items.overTimestamps) items.overTimestamps = [];
                items.overTimestamps.push({
                    overNum: Math.floor(items.balls / 6),
                    timestamp: Date.now(),
                    totalRuns: items.runs
                });
            }

            // Strike rotation
            if (((finalBall.runs || 0) % 2 !== 0 && !finalBall.isWide && !finalBall.isNoBall) ||
                ((finalBall.isWide || finalBall.isNoBall) && (finalBall.runs || 0) % 2 !== 0)) {
                items.batsmen = items.batsmen.map(b =>
                    (b.isStriker !== undefined && !b.isOut) ? { ...b, isStriker: !b.isStriker } : b
                );
            }

            let newState = {
                ...state,
                innings: newInnings,
                isFreehitNext: ball.isNoBall && state.settings?.freehitEnabled
            };

            return validateMatchState(evaluateMatchStatus(newState));
        }

        case 'NEW_OVER': {
            const { newBowlerName } = action.payload || {};
            const innings = [...state.innings];
            const items = { ...innings[state.currentInnings - 1] };
            innings[state.currentInnings - 1] = items;

            const lastBowler = items.currentBowlerName || null;

            items.thisOver = [];
            items.batsmen = items.batsmen.map(b =>
                (b.isStriker !== undefined && !b.isOut) ? { ...b, isStriker: !b.isStriker } : b
            );

            if (newBowlerName) {
                const bIdx = items.bowlers.findIndex(b => b.name.trim() === newBowlerName.trim());
                if (bIdx === -1) {
                    items.bowlers = [...items.bowlers, {
                        name: newBowlerName.trim(), overs: 0, maidens: 0, runs: 0, wickets: 0, fours: 0, sixes: 0
                    }];
                }
                items.currentBowlerName = newBowlerName.trim();
            }

            return { ...state, innings, lastOverBowler: lastBowler };
        }

        case 'WICKET': {
            const { wicketData } = action.payload;
            const currentIdx = state.currentInnings - 1;

            const newInnings = [...state.innings];
            const items = { ...newInnings[currentIdx] };
            newInnings[currentIdx] = items;

            if (wicketData.type !== 'retired') {
                items.wickets = (items.wickets || 0) + 1;
            }
            items.batsmen = [...items.batsmen];
            items.bowlers = [...items.bowlers];
            items.timeline = [...(items.timeline || [])];
            items.thisOver = [...(items.thisOver || [])];

            // Log the ball unless it's just a player retire
            if (wicketData.type !== 'retired') {
                const isWideWicket = Boolean(wicketData.isWide);
                const wideExtra   = isWideWicket ? (wicketData.wideRuns || 1) : 0;

                const wicketBall = {
                    runs: wicketData.runsCompleted || 0,
                    extras: wideExtra,
                    extraType: isWideWicket ? 'wide' : null,
                    isWide: isWideWicket,
                    isNoBall: false,
                    isWicket: true,
                    wicketType: wicketData.type,
                    batsmanName: wicketData.outBatsmanName,
                    bowlerName: wicketData.bowlerName,
                    dismissalText: wicketData.dismissalText,
                    timestamp: Date.now()
                };
                items.timeline.push(wicketBall);
                items.thisOver.push(wicketBall);

                // Wide ball: add extra run, do NOT count as a legal ball
                if (isWideWicket) {
                    items.runs = (items.runs || 0) + wideExtra + (wicketData.runsCompleted || 0);
                    items.extras = { ...items.extras };
                    items.extras.wides = (items.extras.wides || 0) + wideExtra;
                } else {
                    // Normal legal delivery — increment ball count
                    items.runs = (items.runs || 0) + (wicketData.runsCompleted || 0);
                    items.balls = (items.balls || 0) + 1;
                    items.overs = Math.floor(items.balls / 6) + (items.balls % 6) / 10;

                    const legalBallsInOver = items.thisOver.filter(b => !b.isWide && !b.isNoBall).length;
                    if (legalBallsInOver === 6) {
                        const runsInOver = items.thisOver.reduce((sum, b) => sum + (b.runs || 0) + (b.isWide || b.isNoBall ? 1 : 0), 0);
                        if (runsInOver === 0) {
                            const bIdx = items.bowlers.findIndex(b => b.name === wicketData.bowlerName);
                            if (bIdx !== -1) {
                                items.bowlers[bIdx] = { ...items.bowlers[bIdx], maidens: (items.bowlers[bIdx].maidens || 0) + 1 };
                            }
                        }
                    }
                }
            }

            const outIdx = items.batsmen.findIndex(b => b.name?.trim()?.toLowerCase() === wicketData.outBatsmanName?.trim()?.toLowerCase());
            let wasStriker = true; // Default to true
            if (outIdx !== -1) {
                const outBatsman = { ...items.batsmen[outIdx] };
                items.batsmen[outIdx] = outBatsman;

                wasStriker = outBatsman.isStriker;
                outBatsman.isOut = true;
                outBatsman.isStriker = false;
                outBatsman.dismissalText = wicketData.dismissalText;
                outBatsman.fielderName = wicketData.fielderName;
                outBatsman.dismissalType = wicketData.type;
                if (wicketData.type !== 'retired') {
                    outBatsman.balls = (outBatsman.balls || 0) + 1;
                    outBatsman.runs = (outBatsman.runs || 0) + (wicketData.runsCompleted || 0);
                } else {
                    // Track explicit retired hurt statistics
                    outBatsman.isRetiredHurt = true;
                    outBatsman.retiredHurtAt = { 
                        over: Math.floor((items.balls || 0) / 6), 
                        ball: (items.balls || 0) % 6 
                    };
                }
            }

            if (wicketData.newBatsmanName) {
                const nameKey = wicketData.newBatsmanName.trim();
                // Find if the batsmen was previously retired hurt
                const existingIdx = items.batsmen.findIndex(b => 
                    b.name.trim().toLowerCase() === nameKey.toLowerCase() && 
                    (b.dismissalType === 'retired' || b.isRetiredHurt)
                );

                if (existingIdx !== -1) {
                    const exBatsman = { ...items.batsmen[existingIdx] };
                    items.batsmen[existingIdx] = exBatsman;
                    
                    // Resume the retired player
                    exBatsman.isOut = false;
                    exBatsman.isStriker = wasStriker;
                    exBatsman.dismissalType = null;
                    exBatsman.dismissalText = null;
                    // Track when they returned to bat
                    exBatsman.returnedAt = { 
                        over: Math.floor((items.balls || 0) / 6), 
                        ball: (items.balls || 0) % 6 
                    };
                } else {
                    items.batsmen.push({
                        name: nameKey, runs: 0, balls: 0, fours: 0, sixes: 0,
                        isStriker: wasStriker, isOut: false, wagonData: []
                    });
                }
            }

            const bIdx = items.bowlers.findIndex(b => b.name === wicketData.bowlerName);
            if (bIdx !== -1) {
                const bowler = { ...items.bowlers[bIdx] };
                items.bowlers[bIdx] = bowler;

                const isWideWicket = Boolean(wicketData.isWide);

                if (wicketData.type !== 'retired') {
                    if (isWideWicket) {
                        // Wide ball: bowler overs don't increase; wide runs charged to bowler
                        bowler.runs = (bowler.runs || 0) + (wicketData.wideRuns || 1) + (wicketData.runsCompleted || 0);
                    } else {
                        const totalBalls = Math.round(Math.floor(bowler.overs || 0) * 6 + ((bowler.overs || 0) % 1) * 10) + 1;
                        bowler.overs = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;
                        bowler.runs = (bowler.runs || 0) + (wicketData.runsCompleted || 0);
                    }
                }

                if (wicketData.isBowlerWicket) {
                    bowler.wickets = (bowler.wickets || 0) + 1;
                }
            }

            const newState = {
                ...state,
                innings: newInnings
            };
            return validateMatchState(evaluateMatchStatus(newState));
        }

        case 'LOGOUT': {
            localStorage.removeItem('cricscorer_login');
            localStorage.removeItem('userSession');
            localStorage.removeItem('cricscorer_last_match_id');
            const lastId = state.matchId;
            if (lastId) localStorage.removeItem(`cricscorer_active_match_${lastId}`);
            clearMatchCache();
            return { ...initialState, loginType: null };
        }

        case 'SWAP_BATSMEN': {
            const currentIdx = state.currentInnings - 1;
            const newInnings = [...state.innings];
            const items = { ...newInnings[currentIdx] };
            newInnings[currentIdx] = items;
            items.batsmen = items.batsmen.map(b =>
                (b.isStriker !== undefined && !b.isOut) ? { ...b, isStriker: !b.isStriker } : b
            );
            return { ...state, innings: newInnings };
        }

        case 'RENAME_TEAM': {
            const { oldName, newName, teamIndex, fixInningsOnly, innIndex } = action.payload;
            if (!oldName || !newName || oldName.trim() === newName.trim()) return state;

            const renamedName = newName.trim();
            const lowerOld = oldName.trim().toLowerCase();

            const updatedInnings = state.innings.map((inn, idx) => {
                if (!inn) return inn;
                const newInn = { ...inn };

                if (fixInningsOnly) {
                    // When fixInningsOnly, only update the specific innings row (by index if given)
                    if (innIndex !== undefined && innIndex !== null && idx !== innIndex) return newInn;
                    if (newInn.battingTeam?.trim().toLowerCase() === lowerOld) newInn.battingTeam = renamedName;
                    if (newInn.bowlingTeam?.trim().toLowerCase() === lowerOld) newInn.bowlingTeam = renamedName;
                    return newInn;
                }

                // Normal rename: update all innings
                if (teamIndex) {
                    if (idx + 1 === teamIndex) {
                        newInn.battingTeam = renamedName;
                    } else {
                        newInn.bowlingTeam = renamedName;
                    }
                } else {
                    if (newInn.battingTeam?.trim().toLowerCase() === lowerOld) newInn.battingTeam = renamedName;
                    if (newInn.bowlingTeam?.trim().toLowerCase() === lowerOld) newInn.bowlingTeam = renamedName;
                }
                return newInn;
            });

            const newState = {
                ...state,
                // fixInningsOnly: skip updating actual team records so we don't create duplicate team names
                team1: (!fixInningsOnly && state.team1.name?.trim().toLowerCase() === lowerOld && (!teamIndex || teamIndex === 1)) ? { ...state.team1, name: renamedName } : state.team1,
                team2: (!fixInningsOnly && state.team2.name?.trim().toLowerCase() === lowerOld && (!teamIndex || teamIndex === 2)) ? { ...state.team2, name: renamedName } : state.team2,
                tossWinner: !fixInningsOnly && state.tossWinner?.trim().toLowerCase() === lowerOld ? renamedName : state.tossWinner,
                batFirst: !fixInningsOnly && state.batFirst?.trim().toLowerCase() === lowerOld ? renamedName : state.batFirst,
                winner: !fixInningsOnly && state.winner?.trim().toLowerCase() === lowerOld ? renamedName : state.winner,
                innings: updatedInnings,
                lastUpdated: Date.now()
            };

            return validateMatchState(evaluateMatchStatus(newState));
        }

        case 'RENAME_PLAYER': {
            const { oldName, newName } = action.payload;
            if (!oldName || !newName) return state;

            const target = oldName.trim();
            const replacement = newName.trim();
            const targetLower = target.toLowerCase();

            if (targetLower === replacement.toLowerCase()) return state;

            // Strict matching for IDs/Names
            const exactRename = (val) => {
                if (!val || typeof val !== 'string') return val;
                if (val.trim().toLowerCase() === targetLower) return replacement;
                return val;
            };

            // Word-boundary matching for sentences (dismissal text)
            const textRename = (val) => {
                if (!val || typeof val !== 'string') return val;
                if (val.trim().toLowerCase() === targetLower) return replacement;
                const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                try {
                    return val.replace(new RegExp(`\\b${escapedTarget}\\b`, 'gi'), replacement);
                } catch (e) { return val; }
            };

            const { role, innIndex, overNum, ballIndex } = action.payload;
            const hasScope = role && innIndex !== undefined && innIndex !== null;
            const isLocalRename = overNum != null;

            const newInnings = (state.innings || []).map((inn, idx) => {
                const isTargetInn = !hasScope || idx === innIndex;

                // ─── BALL-LEVEL RENAME (most specific) ───
                if (isTargetInn && overNum != null && ballIndex != null) {
                    let currentOverNum = 1;
                    let legalBallsInOver = 0;
                    let ballInOverIdx = 0;

                    const newTimeline = (inn.timeline || []).map((b) => {
                        const isInTargetOver = currentOverNum === overNum;
                        const isLegal = !b.isWide && !b.isNoBall;

                        let updatedBall = b;
                        if (isInTargetOver && ballInOverIdx === ballIndex) {
                            updatedBall = { ...b };
                            if ((!role || role === 'bowler') && b.bowlerName?.trim().toLowerCase() === targetLower) {
                                updatedBall.bowlerName = replacement;
                            }
                            if ((!role || role === 'batsman') && b.batsmanName?.trim().toLowerCase() === targetLower) {
                                updatedBall.batsmanName = replacement;
                            }
                        }

                        if (isInTargetOver) {
                            ballInOverIdx++;
                        }
                        if (isLegal) {
                            legalBallsInOver++;
                            if (legalBallsInOver === 6) {
                                currentOverNum++;
                                legalBallsInOver = 0;
                                ballInOverIdx = 0;
                            }
                        }
                        return updatedBall;
                    });

                    const newThisOver = (inn.thisOver || []).map((b, bIdx) => {
                        const currentOverNumForThis = Math.floor((inn.balls || 0) / 6) + 1;
                        if (currentOverNumForThis === overNum && bIdx === ballIndex) {
                            const updatedB = { ...b };
                            if ((!role || role === 'bowler') && b.bowlerName?.trim().toLowerCase() === targetLower) {
                                updatedB.bowlerName = replacement;
                            }
                            if ((!role || role === 'batsman') && b.batsmanName?.trim().toLowerCase() === targetLower) {
                                updatedB.batsmanName = replacement;
                            }
                            return updatedB;
                        }
                        return b;
                    });

                    // Also update bowler/batsman names in players list for consistency
                    const updatedBatsmen = (inn.batsmen || []).map(b => (b.name?.trim().toLowerCase() === targetLower ? { ...b, name: replacement } : b));
                    const updatedBowlers = (inn.bowlers || []).map(b => (b.name?.trim().toLowerCase() === targetLower ? { ...b, name: replacement } : b));

                    return { ...inn, timeline: newTimeline, thisOver: newThisOver, batsmen: updatedBatsmen, bowlers: updatedBowlers };
                }

                // ─── OVER-LEVEL BOWLER RENAME ───
                if (isTargetInn && overNum != null && role === 'bowler') {
                    let currentOverNum = 1;
                    let legalBallsInOver = 0;
                    let statsToMove = { runs: 0, balls: 0, wickets: 0, fours: 0, sixes: 0 };
                    
                    const newTimeline = (inn.timeline || []).map((b) => {
                        const isInTargetOver = currentOverNum === overNum;
                        const isLegal = !b.isWide && !b.isNoBall;

                        let updatedBall = { ...b };
                        if (isInTargetOver && b.bowlerName?.trim().toLowerCase() === targetLower) {
                            const runsConceded = (b.runs || 0) + (b.isWide || b.isNoBall ? (b.extras || 1) : 0);
                            statsToMove.runs += (!b.isBye && !b.isLegBye) ? runsConceded : 0;
                            if (isLegal) statsToMove.balls += 1;
                            if (b.isWicket && !['runout', 'retired', 'stumped'].includes(b.wicketType)) {
                                statsToMove.wickets += 1;
                            }
                            if (b.runs === 4) statsToMove.fours += 1;
                            if (b.runs === 6) statsToMove.sixes += 1;
                            
                            updatedBall.bowlerName = replacement;
                        }

                        if (isLegal) {
                            legalBallsInOver++;
                            if (legalBallsInOver === 6) {
                                currentOverNum++;
                                legalBallsInOver = 0;
                            }
                        }
                        return updatedBall;
                    });

                    let newBowlers = [...(inn.bowlers || [])];
                    const oldBowlerIdx = newBowlers.findIndex(b => b.name?.trim().toLowerCase() === targetLower);
                    if (oldBowlerIdx !== -1) {
                        const b = { ...newBowlers[oldBowlerIdx] };
                        const oldBalls = Math.round(Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10));
                        const newBalls = Math.max(0, oldBalls - statsToMove.balls);
                        b.overs = Math.floor(newBalls / 6) + (newBalls % 6) / 10;
                        b.runs = Math.max(0, (b.runs || 0) - statsToMove.runs);
                        b.wickets = Math.max(0, (b.wickets || 0) - statsToMove.wickets);
                        b.fours = Math.max(0, (b.fours || 0) - statsToMove.fours);
                        b.sixes = Math.max(0, (b.sixes || 0) - statsToMove.sixes);
                        newBowlers[oldBowlerIdx] = b;
                    }

                    const newBowlerIdx = newBowlers.findIndex(b => b.name?.trim().toLowerCase() === replacement.toLowerCase());
                    if (newBowlerIdx !== -1) {
                        const b = { ...newBowlers[newBowlerIdx] };
                        const oldBalls = Math.round(Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10));
                        const newBalls = oldBalls + statsToMove.balls;
                        b.overs = Math.floor(newBalls / 6) + (newBalls % 6) / 10;
                        b.runs = (b.runs || 0) + statsToMove.runs;
                        b.wickets = (b.wickets || 0) + statsToMove.wickets;
                        b.fours = (b.fours || 0) + statsToMove.fours;
                        b.sixes = (b.sixes || 0) + statsToMove.sixes;
                        newBowlers[newBowlerIdx] = b;
                    } else {
                        newBowlers.push({
                            name: replacement,
                            overs: Math.floor(statsToMove.balls / 6) + (statsToMove.balls % 6) / 10,
                            runs: statsToMove.runs,
                            wickets: statsToMove.wickets,
                            maidens: 0, fours: statsToMove.fours, sixes: statsToMove.sixes
                        });
                    }

                    return {
                        ...inn,
                        timeline: newTimeline,
                        bowlers: newBowlers,
                        currentBowlerName: (inn.currentBowlerName?.trim().toLowerCase() === targetLower) ? replacement : inn.currentBowlerName,
                        thisOver: (inn.thisOver || []).map(b => (b.bowlerName?.trim().toLowerCase() === targetLower ? { ...b, bowlerName: replacement } : b))
                    };
                }

                // ─── OVER-LEVEL BATSMAN RENAME ───
                if (isTargetInn && overNum != null && role === 'batsman') {
                    let currentOverNum = 1;
                    let legalBallsInOver = 0;

                    const newTimeline = (inn.timeline || []).map((b) => {
                        const isInTargetOver = currentOverNum === overNum;
                        const isLegal = !b.isWide && !b.isNoBall;

                        let updatedBall = b;
                        if (isInTargetOver && b.batsmanName?.trim().toLowerCase() === targetLower) {
                            updatedBall = { ...b, batsmanName: replacement };
                        }

                        if (isLegal) {
                            legalBallsInOver++;
                            if (legalBallsInOver === 6) {
                                currentOverNum++;
                                legalBallsInOver = 0;
                            }
                        }
                        return updatedBall;
                    });

                    const newThisOver = (inn.thisOver || []).map(b => {
                        const currentOverNumForThis = Math.floor((inn.balls || 0) / 6) + 1;
                        if (currentOverNumForThis === overNum && b.batsmanName?.trim().toLowerCase() === targetLower) {
                            return { ...b, batsmanName: replacement };
                        }
                        return b;
                    });

                    const updatedBatsmen = (inn.batsmen || []).map(b => (b.name?.trim().toLowerCase() === targetLower ? { ...b, name: replacement } : b));

                    return { ...inn, timeline: newTimeline, thisOver: newThisOver, batsmen: updatedBatsmen };
                }

                if (isLocalRename && !isTargetInn) {
                    return inn;
                }

                // ─── PERVASIVE RENAME LOGIC (Scorecard table / Global rename) ───
                const renameBatsmen = !hasScope || (role === 'batsman' && idx === innIndex) || !role;
                const renameBowlers = !hasScope || (role === 'bowler' && idx === innIndex) || !role;

                const newBatsmen = (inn.batsmen || []).map(b => ({
                    ...b,
                    name: (renameBatsmen && b.name?.trim().toLowerCase() === targetLower) ? replacement : b.name,
                    dismissalText: renameBatsmen ? textRename(b.dismissalText) : b.dismissalText
                }));

                const renamedBowlers = (inn.bowlers || []).map(b => ({
                    ...b,
                    name: (renameBowlers && b.name?.trim().toLowerCase() === targetLower) ? replacement : b.name
                }));

                // Deduplicate & merge bowlers if rename created duplicate bowler names in the same inning
                const mergedBowlers = [];
                const bowlerMap = {};
                renamedBowlers.forEach(b => {
                    const key = (b.name || '').trim().toUpperCase();
                    if (!key) { mergedBowlers.push(b); return; }
                    if (bowlerMap[key]) {
                        const existing = bowlerMap[key];
                        const b1Balls = Math.round(Math.floor(existing.overs || 0) * 6 + Math.round(((existing.overs || 0) % 1) * 10));
                        const b2Balls = Math.round(Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10));
                        const totalBalls = b1Balls + b2Balls;
                        existing.overs = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;
                        existing.runs = (existing.runs || 0) + (b.runs || 0);
                        existing.wickets = (existing.wickets || 0) + (b.wickets || 0);
                        existing.maidens = (existing.maidens || 0) + (b.maidens || 0);
                        existing.fours = (existing.fours || 0) + (b.fours || 0);
                        existing.sixes = (existing.sixes || 0) + (b.sixes || 0);
                    } else {
                        const clone = { ...b };
                        bowlerMap[key] = clone;
                        mergedBowlers.push(clone);
                    }
                });

                const newTimeline = (inn.timeline || []).map(b => ({
                    ...b,
                    batsmanName: (renameBatsmen && b.batsmanName?.trim().toLowerCase() === targetLower) ? replacement : b.batsmanName,
                    bowlerName: (renameBowlers && b.bowlerName?.trim().toLowerCase() === targetLower) ? replacement : b.bowlerName,
                    fielderName: exactRename(b.fielderName)
                }));
                const newThisOver = (inn.thisOver || []).map(b => ({
                    ...b,
                    batsmanName: (renameBatsmen && b.batsmanName?.trim().toLowerCase() === targetLower) ? replacement : b.batsmanName,
                    bowlerName: (renameBowlers && b.bowlerName?.trim().toLowerCase() === targetLower) ? replacement : b.bowlerName
                }));
                const newFOW = (inn.fallOfWickets || []).map(w => ({
                    ...w,
                    batsmanName: (renameBatsmen && w.batsmanName?.trim().toLowerCase() === targetLower) ? replacement : w.batsmanName,
                    bowlerName: (renameBowlers && w.bowlerName?.trim().toLowerCase() === targetLower) ? replacement : w.bowlerName,
                    newBatsmanName: (renameBatsmen && w.newBatsmanName?.trim().toLowerCase() === targetLower) ? replacement : w.newBatsmanName
                }));

                return {
                    ...inn,
                    batsmen: newBatsmen,
                    bowlers: mergedBowlers,
                    timeline: newTimeline,
                    thisOver: newThisOver,
                    fallOfWickets: newFOW,
                    currentBowlerName: (renameBowlers && inn.currentBowlerName?.trim().toLowerCase() === targetLower) ? replacement : inn.currentBowlerName,
                    battingTeam: inn.battingTeam,
                    bowlingTeam: inn.bowlingTeam
                };
            });

            // Find matching localStorage key for this matchId
            const matchIdStr = String(state.matchId || '');
            const rawId = matchIdStr.replace('MATCH-', '');
            const storagePrefixKeys = Object.keys(localStorage).filter(k => 
                (matchIdStr && k.includes(matchIdStr)) || (rawId && k.includes(rawId))
            );
            let existingStateData = {};
            let appliedKey = `cricscorer_guest_match_${state.matchId}`;
            if (storagePrefixKeys.length > 0) {
                appliedKey = storagePrefixKeys[0];
                try {
                    existingStateData = JSON.parse(localStorage.getItem(appliedKey)) || {};
                } catch (e) { }
            }

            const newState = {
                ...existingStateData,
                ...state,
                innings: newInnings,
                manOfMatch: (!isLocalRename && state.manOfMatch) ? { ...state.manOfMatch, name: exactRename(state.manOfMatch.name) } : state.manOfMatch,
                renameCount: (state.renameCount || 0) + 1,
                lastUpdated: Date.now()
            };

            const finalState = validateMatchState(evaluateMatchStatus(newState));

            try {
                localStorage.setItem(appliedKey, JSON.stringify(finalState));
            } catch (e) { }

            // Sync updated match state to cloud / firestore
            syncToFirestore(finalState);

            return finalState;
        }



        case 'UNDO': {
            return validateMatchState({
                ...state,
                ...action.payload
            });
        }

        default:
            return state;
    }
}

function matchReducer(state, action) {
    const newState = matchReducerRaw(state, action);
    // Track timestamps for intelligent syncing algorithm
    if (newState !== state && !['UPDATE_STATE', 'INIT_MATCH', 'LOGOUT'].includes(action.type)) {
        const now = Date.now();
        return {
            ...newState,
            updatedAt: now,
            lastUpdated: now
        };
    }
    return newState;
}

export const MatchProvider = ({ children }) => {
    const [state, dispatch] = useReducer(matchReducer, initialState);
    const historyRef = React.useRef([]);
    const stateRef = React.useRef(initialState);
    const [historyCount, setHistoryCount] = React.useState(0); // 🔑 triggers re-render on undo stack changes

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const wrappedDispatch = React.useCallback((action) => {
        const currentState = stateRef.current;

        // Captured state snapshots for Undo
        if (action.type === 'ADD_BALL' || action.type === 'WICKET' || action.type === 'SWAP_BATSMEN' || action.type === 'NEW_OVER' || action.type === 'RENAME_PLAYER' || action.type === 'RENAME_TEAM') {
            const { history: _, ...snap } = currentState;
            historyRef.current = [JSON.parse(JSON.stringify(snap)), ...historyRef.current].slice(0, 50);
            setHistoryCount(historyRef.current.length);
        }

        // Clear history on fresh match or state restoration
        if (action.type === 'INIT_MATCH' || action.type === 'LOGOUT') {
            historyRef.current = [];
            setHistoryCount(0);
        }

        if (action.type === 'UPDATE_STATE' && action.payload?.matchId && action.payload.matchId !== state.matchId) {
            historyRef.current = [];
            setHistoryCount(0);
        }

        if (action.type === 'RENAME_PLAYER') {
            const { oldName, newName, overNum: renameOverNum, ballIndex: renameBallIndex } = action.payload;
            const isLocalRename = renameOverNum != null;
            clearMatchCache();
            // Clear the sessionStorage history cache so History page shows updated name
            sessionStorage.removeItem('cricscorer_history_matches');

            // Background Firestore Task — only for GLOBAL renames (not over/ball-level local fixes)
            if (!isLocalRename && currentState.userCode && currentState.loginType !== 'guest') {
                (async () => {
                    try {
                        const userColl = currentState.loginType === 'google' ? 'googleUsers' : 'shareLogins';
                        const docRef = doc(db, userColl, currentState.userCode);
                        const userSnap = await getDoc(docRef);
                        if (userSnap.exists()) {
                            const data = userSnap.data();
                            const players = data.players || {};
                            if (players[oldName]) {
                                const stats = players[oldName];
                                const updates = { [`players.${oldName}`]: deleteField() };
                                if (players[newName]) {
                                    updates[`players.${newName}`] = {
                                        runs: (players[newName].runs || 0) + (stats.runs || 0),
                                        balls: (players[newName].balls || 0) + (stats.balls || 0),
                                        wickets: (players[newName].wickets || 0) + (stats.wickets || 0),
                                        matches: (players[newName].matches || 0) + (stats.matches || 0)
                                    };
                                } else {
                                    updates[`players.${newName}`] = stats;
                                }
                                await updateDoc(docRef, updates);
                            }
                        }
                    } catch (e) { console.error("BG Rename Fail:", e); }
                })();
            }


            // Compute snap and save immediately
            const snap = JSON.parse(JSON.stringify(matchReducer(currentState, action)));
            if (snap.matchStatus === 'complete' || snap.matchStatus === 'live' || snap.matchStatus === 'innings_break') {
                syncToFirestore(snap).catch(e => console.error("Sync Fail:", e));
            }

            if (currentState.matchId) {
                const userScope = getUserScope(currentState);
                const storageKey = `cricscorer_${userScope}_match_${currentState.matchId}`;
                const validatedSnap = validateMatchState(snap);
                localStorage.setItem(storageKey, JSON.stringify(validatedSnap));
                idbPromise.then(db => db.put('matches', validatedSnap, currentState.matchId));

                // IF TOURNAMENT MATCH, MUST UPDATE THE EMBEDDED TOURNAMENT SNAPSHOT!
                if (validatedSnap.isTournamentMatch && validatedSnap.tournamentId) {
                    const existingT = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
                    const tIndex = existingT.findIndex(t => t.tournamentId === validatedSnap.tournamentId);
                    if (tIndex !== -1) {
                        const tInfo = existingT[tIndex];
                        const mIndex = tInfo.matches.findIndex(m => m.matchId === validatedSnap.matchId);
                        if (mIndex !== -1) {
                            tInfo.matches[mIndex].matchState = validatedSnap;
                            if (validatedSnap.team1?.name && tInfo.matches[mIndex].team1Name) tInfo.matches[mIndex].team1Name = validatedSnap.team1.name;
                            if (validatedSnap.team2?.name && tInfo.matches[mIndex].team2Name) tInfo.matches[mIndex].team2Name = validatedSnap.team2.name;

                            existingT[tIndex] = tInfo;
                            localStorage.setItem('cricscore_tournaments', JSON.stringify(existingT));

                            // Fire & forget firestore tournament update
                            import('firebase/firestore').then(f => {
                                const tDoc = f.doc(db, 'tournaments', validatedSnap.tournamentId);
                                f.setDoc(tDoc, tInfo, { merge: true }).catch(console.error);
                            }).catch(() => { });
                        }
                    }
                }
            }
        }

        if (action.type === 'RENAME_TEAM') {
            const { oldName, newName } = action.payload;
            clearMatchCache();
            sessionStorage.removeItem('cricscorer_history_matches');
            removeNameFromStorage(oldName);
            saveNameToStorage(newName);

            // Immediately trigger a sync for the match itself
            const snap = JSON.parse(JSON.stringify(matchReducer(currentState, action)));
            if (snap.matchStatus === 'complete') {
                syncToFirestore(snap).catch(e => console.error("Immediate sync fail:", e));
            }

            // Immediate Local Save for Renames to prevent loss on navigation
            if (currentState.matchId) {
                const userScope = getUserScope(currentState);
                const storageKey = `cricscorer_${userScope}_match_${currentState.matchId}`;
                const validatedSnap = validateMatchState(snap);
                localStorage.setItem(storageKey, JSON.stringify(validatedSnap));
                idbPromise.then(db => db.put('matches', validatedSnap, currentState.matchId));

                // IF TOURNAMENT MATCH, MUST UPDATE THE EMBEDDED TOURNAMENT SNAPSHOT!
                if (validatedSnap.isTournamentMatch && validatedSnap.tournamentId) {
                    const existingT = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
                    const tIndex = existingT.findIndex(t => t.tournamentId === validatedSnap.tournamentId);
                    if (tIndex !== -1) {
                        const tInfo = existingT[tIndex];
                        const mIndex = tInfo.matches.findIndex(m => m.matchId === validatedSnap.matchId);
                        if (mIndex !== -1) {
                            tInfo.matches[mIndex].matchState = validatedSnap;
                            if (validatedSnap.team1?.name && tInfo.matches[mIndex].team1Name) tInfo.matches[mIndex].team1Name = validatedSnap.team1.name;
                            if (validatedSnap.team2?.name && tInfo.matches[mIndex].team2Name) tInfo.matches[mIndex].team2Name = validatedSnap.team2.name;

                            existingT[tIndex] = tInfo;
                            localStorage.setItem('cricscore_tournaments', JSON.stringify(existingT));

                            // Fire & forget firestore tournament update
                            import('firebase/firestore').then(f => {
                                const tDoc = f.doc(db, 'tournaments', validatedSnap.tournamentId);
                                f.setDoc(tDoc, tInfo, { merge: true }).catch(console.error);
                            }).catch(() => { });
                        }
                    }
                }

                if (snap.matchStatus === 'complete') {
                    const summaryKey = `cricscorer_${userScope}_recent_summaries`;
                    const summaries = JSON.parse(localStorage.getItem(summaryKey) || '[]');
                    const newSummary = {
                        matchId: snap.matchId,
                        team1: snap.team1.name,
                        team2: snap.team2.name,
                        winner: snap.winner,
                        runs: snap.innings[0].runs,
                        wickets: snap.innings[0].wickets,
                        overs: snap.innings[0].overs,
                        endTime: snap.endTime
                    };
                    const updatedSummaries = [newSummary, ...summaries.filter(s => s.matchId !== snap.matchId)].slice(0, 10);
                    localStorage.setItem(summaryKey, JSON.stringify(updatedSummaries));
                }
            }
        }

        if (action.type === 'UNDO') {
            if (historyRef.current.length === 0) return;
            const prev = historyRef.current[0];
            historyRef.current = historyRef.current.slice(1);
            setHistoryCount(historyRef.current.length);
            dispatch({ type: 'UNDO', payload: prev });
            return;
        }

        // Issue 4: Local-first save — immediately write new match to localStorage on creation
        if (action.type === 'INIT_MATCH' && action.payload?.matchId) {
            try {
                const snap = matchReducer(currentState, action);
                const validatedSnap = validateMatchState(snap);
                const userScope = getUserScope(snap);
                const storageKey = `cricscorer_${userScope}_match_${action.payload.matchId}`;
                localStorage.setItem(storageKey, JSON.stringify({ ...validatedSnap, lastUpdated: Date.now() }));
                idbPromise.then(db => db.put('matches', validatedSnap, action.payload.matchId).catch(() => { }));
                sessionStorage.removeItem('cricscorer_history_matches');
            } catch (e) {
                console.error("Issue 4: Local-first save error:", e);
            }
        }

        // Fix for "matches not showing in history immediately": synchronously write the concluded state
        if (action.type === 'MATCH_COMPLETE' || action.type === 'ABANDON_MATCH') {
            try {
                const snap = JSON.parse(JSON.stringify(matchReducer(currentState, action)));
                const validatedSnap = validateMatchState(snap);
                if (currentState.matchId) {
                    const userScope = getUserScope(currentState);
                    const storageKey = `cricscorer_${userScope}_match_${currentState.matchId}`;
                    localStorage.setItem(storageKey, JSON.stringify(validatedSnap));
                    idbPromise.then(db => db.put('matches', validatedSnap, currentState.matchId).catch(() => { }));

                    // Also clear History cache so it is forced to fetch the latest
                    sessionStorage.removeItem('cricscorer_history_matches');
                }
            } catch (e) {
                console.error("Immediate match completion sync error:", e);
            }
        }

        dispatch(action);
    }, []);

    const historyLength = historyCount; // driven by useState — re-renders UI correctly

    // Persistence: Save to localStorage/IDB on every state change, Cloud sync ONLY on over completion or match events
    useEffect(() => {
        if (!state.matchId) return;

        // Prevent wiping data: Only save if state is "active" or not purely empty setup
        const hasData = state.innings[0].batsmen.length > 0 || state.team1.name !== '';
        if (!hasData && state.matchStatus === 'setup') return;

        // Save to IndexedDB (Fast) - Exclude history to keep it lightweight
        const { history: _, ...stateToSave } = state;
        const idbTimer = setTimeout(() => {
            idbPromise.then(db => db.put('matches', stateToSave, state.matchId));
        }, 300);

        // Save to localStorage EVERY ball (instant, local, no lag)
        const userScope = getUserScope(state);
        const storageKey = `cricscorer_${userScope}_match_${state.matchId}`;
        const liveMatchKey = "cricscorer_live_match";

        try {
            const stateToSaveValidated = validateMatchState(stateToSave);
            const stateJson = JSON.stringify(stateToSaveValidated);

            localStorage.setItem(storageKey, stateJson);
            localStorage.setItem(`cricscorer_${userScope}_last_match_id`, state.matchId);

            // Current live match for quick recovery
            if (state.matchStatus === 'live' || state.matchStatus === 'innings_break') {
                localStorage.setItem(liveMatchKey, stateJson);
            } else if (state.matchStatus === 'complete') {
                localStorage.removeItem(liveMatchKey);
            }

            // Save names to autocomplete storage
            if (state.team1?.name) saveNameToStorage(state.team1.name);
            if (state.team2?.name) saveNameToStorage(state.team2.name);
            state.innings?.forEach(inn => {
                inn.batsmen?.forEach(b => { if (b.name) saveNameToStorage(b.name); });
                inn.bowlers?.forEach(b => { if (b.name) saveNameToStorage(b.name); });
            });

            // Maintain completed match summaries
            if (state.matchStatus === 'complete') {
                const summaryKey = `cricscorer_${userScope}_recent_summaries`;
                const summaries = JSON.parse(localStorage.getItem(summaryKey) || '[]');
                const newSummary = {
                    matchId: state.matchId,
                    team1: state.team1.name,
                    team2: state.team2.name,
                    winner: state.winner,
                    runs: state.innings[0].runs,
                    wickets: state.innings[0].wickets,
                    overs: state.innings[0].overs,
                    endTime: state.endTime
                };
                const updatedSummaries = [newSummary, ...summaries.filter(s => s.matchId !== state.matchId)].slice(0, 10);
                localStorage.setItem(summaryKey, JSON.stringify(updatedSummaries));
            }
        } catch (e) {
            console.error("Local Storage Sync Error:", e);
        }

        return () => { clearTimeout(idbTimer); };
    }, [state.innings, state.matchStatus, state.team1.name, state.team2.name, state.matchId, state.totalOvers, state.manOfMatch, state.winner]);    // CLOUD SYNC: Triggered ONLY on over completion or match status changes (not every ball)
    // Also triggers after 10-second idle or IMMEDIATELY on rename (Issue 2 & 4)
    const lastSyncedBallsRef = React.useRef(0);
    const lastSyncedRenameCountRef = React.useRef(0);
    const idleSyncTimerRef = React.useRef(null);
    useEffect(() => {
        if (!state.matchId || state.loginType === 'guest' || state.matchStatus === 'setup') return;

        const currentBalls = state.innings.reduce((sum, inn) => sum + (inn.balls || 0), 0);
        const currentOvers = Math.floor(currentBalls / 6);
        const lastSyncedOvers = Math.floor(lastSyncedBallsRef.current / 6);
        const currentRenameCount = state.renameCount || 0;

        // Determine if we should sync now
        const isOverJustCompleted = currentOvers > lastSyncedOvers && currentBalls % 6 === 0;
        const isMatchComplete = state.matchStatus === 'complete';
        const isInningsBreak = state.matchStatus === 'innings_break';
        const hasRenamed = currentRenameCount > lastSyncedRenameCountRef.current;

        const doSync = () => {
            if (window._isSyncing) return;
            if (currentBalls === lastSyncedBallsRef.current && currentRenameCount === lastSyncedRenameCountRef.current && !isMatchComplete && !isInningsBreak) return;

            window._isSyncing = true;
            lastSyncedBallsRef.current = currentBalls;
            lastSyncedRenameCountRef.current = currentRenameCount;
            const { history: _h, ...stateToSync } = state;

            if (isMatchComplete) {
                dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
            }

            syncToFirestore({ ...stateToSync, loginType: state.loginType, userCode: state.userCode })
                .then(() => {
                    if (isMatchComplete) {
                        dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
                        console.log('[Sync] Match complete sync SUCCESS:', state.matchId);
                        import('../utils/dataFetcher').then(mod => {
                            mod.syncAllLocalMatchesToCloud().catch(e => console.warn('[AutoSync] syncAll error:', e));
                        });
                    } else {
                        console.log(`[Sync] Over ${currentOvers} (or rename) synced to cloud`);
                    }
                })
                .catch(e => {
                    console.warn("[CloudSync] Error:", e);
                    if (isMatchComplete) {
                        lastSyncedBallsRef.current = 0;
                    }
                })
                .finally(() => { window._isSyncing = false; });
        };

        // Immediate sync on over completion, match events, or renames
        if (isOverJustCompleted || isMatchComplete || isInningsBreak || hasRenamed) {
            doSync();
        }

        // Issue 2: 10-second idle timeout sync — ensures data reaches cloud even mid-over
        if (idleSyncTimerRef.current) clearTimeout(idleSyncTimerRef.current);
        if (state.matchStatus === 'live' && currentBalls > lastSyncedBallsRef.current) {
            idleSyncTimerRef.current = setTimeout(() => {
                console.log('[Sync] 10s idle timeout — syncing mid-over');
                doSync();
            }, 10000);
        }

        return () => {
            if (idleSyncTimerRef.current) clearTimeout(idleSyncTimerRef.current);
        };
    }, [state.innings, state.matchStatus, state.matchId, state.loginType, state.renameCount]);

    useEffect(() => {
        const sessionStr = localStorage.getItem('userSession');
        const legacyStr = localStorage.getItem('cricscorer_login');

        let savedLogin = null;
        if (sessionStr) savedLogin = sessionStr;
        else if (legacyStr) savedLogin = legacyStr;

        if (savedLogin) {
            const runStartupVerification = async () => {
                const parsed = JSON.parse(savedLogin);
                let { loginType, userCode, matchId, userName, ownerName } = parsed;

                try {
                    if (loginType === 'shareable' && userCode) {
                        const { getDoc, doc } = await import('firebase/firestore');
                        const snap = await getDoc(doc(db, 'shareLogins', userCode));
                        // Wrap auth checking carefully
                        let currentUid = null;
                        try {
                            const { auth } = await import('../firebase');
                            currentUid = auth?.currentUser?.uid;
                        } catch (authErr) {
                            console.warn('[AUTH] Startup verification skipped:', authErr.message);
                            return; // Do NOT reset match state here or run the rest of the verification
                        }

                        if (snap.exists() && snap.data().ownerUid && snap.data().ownerUid !== currentUid) {
                            console.warn("IDOR Triggered: Forcing Read-Only Viewer Mode");
                            loginType = 'code';
                            parsed.loginType = 'code';
                            localStorage.setItem('userSession', JSON.stringify(parsed));
                            if (localStorage.getItem('cricscorer_login')) localStorage.setItem('cricscorer_login', JSON.stringify(parsed));
                        }
                    }
                } catch (e) {
                    console.warn('[AUTH] Startup verification skipped:', e.message);
                    return; // Do NOT reset match state here
                }

                if (userCode && state.userCode !== userCode) {
                    clearMatchCache();
                    dispatch({
                        type: 'UPDATE_STATE',
                        payload: validateMatchState({ ...initialState, loginType, userCode, matchId, userName, ownerName })
                    });
                    return;
                }

                // Proceed to load matches from storage...
                const sessionStr = localStorage.getItem('cricscorer_login') || localStorage.getItem('userSession');
                const sessionObj = sessionStr ? JSON.parse(sessionStr) : {};
                const userScope = getUserScope(sessionObj);
                const lastId = matchId || localStorage.getItem(`cricscorer_${userScope}_last_match_id`);
                if (lastId) {
                    const localSaved = localStorage.getItem(`cricscorer_${userScope}_match_${lastId}`);
                    if (localSaved) {
                        dispatch({ type: 'UPDATE_STATE', payload: validateMatchState(JSON.parse(localSaved)) });
                    } else {
                        const { openDB } = await import('idb');
                        const db = await openDB('CricScorerDB', 1);
                        const savedMatch = await db.get('matches', lastId);
                        if (savedMatch) dispatch({ type: 'UPDATE_STATE', payload: validateMatchState(savedMatch) });
                    }
                }
            };

            try {
                runStartupVerification();
            } catch (err) {
                console.warn('[AUTH] Startup verification skipped:', err.message);
            }
        }
    }, []);

    // CRITICAL: Sync to Firestore when app returns from background
    // On mobile (Capacitor), timers and async calls are killed when backgrounded.
    // This ensures any unsaved match data gets pushed to cloud on resume.
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && state.matchId && state.loginType !== 'guest') {
                const { history: _, ...stateToSync } = state;
                // Sync the current match state
                if (state.matchStatus === 'live' || state.matchStatus === 'complete' || state.matchStatus === 'innings_break') {
                    syncToFirestore({ ...stateToSync, loginType: state.loginType, userCode: state.userCode })
                        .then(() => console.log('[VisSync] Synced on app resume'))
                        .catch(e => console.warn('[VisSync] Failed:', e));
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [state.matchId, state.matchStatus, state.innings, state.loginType, state.userCode]);

    // Sync all known player names from Firestore to local autocomplete pool on load
    useEffect(() => {
        const syncNames = async () => {
            if (!state.userCode || state.loginType === 'guest') return;

            try {
                const names = await fetchRecentPlayers();
                if (names && names.length > 0) {
                    saveMultipleNamesToStorage(names);
                }
            } catch (e) {
                // Share error handled silently or with toast if preferred
            }
        };

        syncNames();
    }, [state.userCode, state.loginType]);

    return (
        <MatchContext.Provider value={{ state, dispatch: wrappedDispatch, historyLength }}>
            {children}
        </MatchContext.Provider>
    );
};

export const useMatch = () => useContext(MatchContext);
