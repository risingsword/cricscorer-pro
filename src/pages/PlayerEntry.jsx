import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft, Save } from 'lucide-react';
import NameInput from '../components/NameInput';
import { triggerHaptic } from '../utils/haptics';

const PlayerEntry = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { state, dispatch } = useMatch();

    // ── SAFE BACK NAVIGATION ──
    // Handles both the header arrow and the Android hardware back button.
    // Falls back to /innings-break if browser history is empty (direct deep-link).
    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/innings-break');
        }
    };

    // ── CAPACITOR HARDWARE BACK BUTTON ──
    // Register listener only while this screen is mounted.
    // Cleanup on unmount to prevent duplicate listeners.
    useEffect(() => {
        let cleanup = null;

        // Runtime check: Capacitor native bridge is only present on the device build.
        // In a browser build this block is safely skipped.
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            // Use the global Capacitor Plugins bridge directly (no npm import needed).
            // @capacitor/app registers the 'App' plugin at runtime on Android/iOS.
            const CapApp = window.Capacitor.Plugins?.App;
            if (CapApp && typeof CapApp.addListener === 'function') {
                let handle = null;
                CapApp.addListener('backButton', () => { handleBack(); })
                    .then(h => { handle = h; })
                    .catch(() => { });
                cleanup = () => {
                    if (handle && typeof handle.remove === 'function') handle.remove();
                };
            }
        }

        return () => { if (cleanup) cleanup(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const locationState = location.state || {};
    const { fromTournament, team1Players = [], team2Players = [] } = locationState;

    // ── EARLY NULL GUARD ──
    // If match state is missing or innings data is invalid (e.g. due to React batching delays
    // on some older phones), show a loading state briefly before redirecting safely.
    const currentInnings = state.currentInnings || 1;
    const currentInn = state.innings?.[currentInnings - 1];

    useEffect(() => {
        if (!state.matchId || !currentInn) {
            const timer = setTimeout(() => {
                navigate('/home', { replace: true });
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [state.matchId, currentInn, navigate]);

    const isSquad1Loaded = team1Players && team1Players.length >= 11;
    const isSquad2Loaded = team2Players && team2Players.length >= 11;

    const parseSquad = (list) => {
        if (!list || list.length === 0) return Array(11).fill({ name: '' });
        const listMapping = list.map(p => ({ name: typeof p === 'string' ? p : p.name }));
        if (listMapping.length < 11) {
            const deficit = 11 - listMapping.length;
            return [...listMapping, ...Array(deficit).fill({ name: '' })];
        }
        return listMapping;
    };

    // ── HOOKS MUST STAY ABOVE THE EARLY RETURN ──
    // These useState calls previously sat *after* the `if (!currentInn) return`
    // guard below, so on loading renders they were skipped — changing the hook
    // order between renders and corrupting React's state (a Rules-of-Hooks
    // violation that can crash with "rendered fewer hooks than expected").
    const [squad1, setSquad1] = useState(() => {
        const cached = localStorage.getItem(`cricscore_temp_squad1_${state.matchId}`);
        if (cached) return JSON.parse(cached);
        return parseSquad(team1Players);
    });

    const [squad2, setSquad2] = useState(() => {
        const cached = localStorage.getItem(`cricscore_temp_squad2_${state.matchId}`);
        if (cached) return JSON.parse(cached);
        return parseSquad(team2Players);
    });

    const [showSquadEntry, setShowSquadEntry] = useState(
        fromTournament && (!isSquad1Loaded || !isSquad2Loaded)
    );

    const [striker, setStriker] = useState('');
    const [nonStriker, setNonStriker] = useState('');
    const [bowler, setBowler] = useState('');

    if (!state.matchId || !currentInn) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', color: '#64748b', fontWeight: '800' }}>Loading match setup...</div>;
    }

    const teamName = currentInn.battingTeam || '';
    const bowlingTeamName = currentInn.bowlingTeam || '';

    // Issue 5 & 6: Validation state for duplicate/empty player names
    const normalize = (name) => name.trim().toLowerCase();

    const getStrikerError = () => {
        const s = normalize(striker);
        if (!s) return '';
        if (normalize(nonStriker) && s === normalize(nonStriker)) return 'This name is already used in this match. Enter a different name.';
        return '';
    };
    const getNonStrikerError = () => {
        const ns = normalize(nonStriker);
        if (!ns) return '';
        if (normalize(striker) && ns === normalize(striker)) return 'This name is already used in this match. Enter a different name.';
        return '';
    };
    const getBowlerError = () => {
        const b = normalize(bowler);
        if (!b) return '';
        if (normalize(striker) && b === normalize(striker)) return 'This name is already used in this match. Enter a different name.';
        if (normalize(nonStriker) && b === normalize(nonStriker)) return 'This name is already used in this match. Enter a different name.';
        return '';
    };

    const strikerError = getStrikerError();
    const nonStrikerError = getNonStrikerError();
    const bowlerError = getBowlerError();
    const hasAnyError = !!(strikerError || nonStrikerError || bowlerError);
    const isFormIncomplete = !striker.trim() || !nonStriker.trim() || !bowler.trim();
    const isStartDisabled = isFormIncomplete || hasAnyError;

    const handleStartInnings = () => {
        if (isStartDisabled) return;

        const batsmen = [
            { name: striker.trim(), runs: 0, balls: 0, fours: 0, sixes: 0, isStriker: true, isOut: false, wagonData: [] },
            { name: nonStriker.trim(), runs: 0, balls: 0, fours: 0, sixes: 0, isStriker: false, isOut: false, wagonData: [] }
        ];

        const bowlers = [
            { name: bowler.trim(), overs: 0, maidens: 0, runs: 0, wickets: 0, fours: 0, sixes: 0 }
        ];

        const innings = [...state.innings];
        innings[currentInnings - 1] = {
            ...innings[currentInnings - 1],
            batsmen,
            bowlers,
            currentBowlerName: bowler.trim(),
            matchStatus: 'live'
        };

        dispatch({
            type: 'UPDATE_STATE',
            payload: {
                innings,
                matchStatus: 'live',
                team1Squad: squad1.filter(p => p.name.trim() !== ''),
                team2Squad: squad2.filter(p => p.name.trim() !== '')
            }
        });
        
        try {
            import('../utils/nameStorage').then(m => {
                if (m.unblockNameFromStorage) {
                    m.unblockNameFromStorage(striker);
                    m.unblockNameFromStorage(nonStriker);
                    m.unblockNameFromStorage(bowler);
                    squad1.forEach(p => p.name && m.unblockNameFromStorage(p.name));
                    squad2.forEach(p => p.name && m.unblockNameFromStorage(p.name));
                }
            });
        } catch (e) {}

        navigate('/live-scoring');
    };

    const updateSquad1 = (idx, val) => {
        const u = [...squad1];
        u[idx] = { name: val.toUpperCase() };
        setSquad1(u);
        localStorage.setItem(`cricscore_temp_squad1_${state.matchId}`, JSON.stringify(u));
    };

    const updateSquad2 = (idx, val) => {
        const u = [...squad2];
        u[idx] = { name: val.toUpperCase() };
        setSquad2(u);
        localStorage.setItem(`cricscore_temp_squad2_${state.matchId}`, JSON.stringify(u));
    };

    const bSquad = teamName === state.team1.name ? squad1 : squad2;
    const bwSquad = bowlingTeamName === state.team1.name ? squad1 : squad2;

    // Issue 5: Duplicate detection within squads
    const getSquadDuplicateError = (squad, idx) => {
        const name = squad[idx]?.name?.trim().toLowerCase();
        if (!name) return '';
        for (let i = 0; i < squad.length; i++) {
            if (i !== idx && squad[i]?.name?.trim().toLowerCase() === name) {
                return 'This name is already used in this match. Enter a different name.';
            }
        }
        return '';
    };
    const hasSquadDuplicates = () => {
        for (let i = 0; i < squad1.length; i++) { if (getSquadDuplicateError(squad1, i)) return true; }
        for (let i = 0; i < squad2.length; i++) { if (getSquadDuplicateError(squad2, i)) return true; }
        return false;
    };

    if (showSquadEntry) {
        const squadHasErrors = hasSquadDuplicates();
        return (
            <div style={{ paddingBottom: '20px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
                <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div onClick={handleBack} style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <ChevronLeft size={20} color="#1e1b4b" />
                        </div>
                        <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b' }}>Enter Full Squads</span>
                    </div>
                </div>

                <div className="container animate-fade-in" style={{ padding: '20px' }}>
                    <p style={{ fontSize: '12px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Provide up to 11 players per team to make bowling selections easier later.</p>

                    {!isSquad1Loaded && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '900', color: '#1e1b4b', marginBottom: '12px' }}>{state.team1.name} Playing XI</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {squad1.map((p, idx) => {
                                    const dupErr = getSquadDuplicateError(squad1, idx);
                                    return (
                                        <div key={idx}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '30px', fontWeight: '800', color: '#94a3b8', fontSize: '13px' }}>{idx + 1}.</div>
                                                <NameInput placeholder={`Player ${idx + 1} Name`} value={p.name} onChange={(val) => updateSquad1(idx, val)} style={{ input: { height: '40px', borderRadius: '10px', fontSize: '14px', backgroundColor: 'white', border: dupErr ? '2px solid #ef4444' : '1.5px solid #e2e8f0' } }} />
                                            </div>
                                            {dupErr && <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', marginTop: '4px', marginLeft: '38px' }}>{dupErr}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!isSquad2Loaded && (
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: '900', color: '#1e1b4b', marginBottom: '12px' }}>{state.team2.name} Playing XI</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {squad2.map((p, idx) => {
                                    const dupErr = getSquadDuplicateError(squad2, idx);
                                    return (
                                        <div key={idx}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '30px', fontWeight: '800', color: '#94a3b8', fontSize: '13px' }}>{idx + 1}.</div>
                                                <NameInput placeholder={`Player ${idx + 1} Name`} value={p.name} onChange={(val) => updateSquad2(idx, val)} style={{ input: { height: '40px', borderRadius: '10px', fontSize: '14px', backgroundColor: 'white', border: dupErr ? '2px solid #ef4444' : '1.5px solid #e2e8f0' } }} />
                                            </div>
                                            {dupErr && <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', marginTop: '4px', marginLeft: '38px' }}>{dupErr}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        disabled={squadHasErrors}
                        onClick={() => {
                            if (squadHasErrors) return;
                            const e1 = !isSquad1Loaded ? squad1.filter(p => !p.name.trim()) : [];
                            const e2 = !isSquad2Loaded ? squad2.filter(p => !p.name.trim()) : [];
                            if (e1.length > 0 || e2.length > 0) {
                                alert("Please fill all 11 player names for both teams to continue.");
                                return;
                            }
                            setShowSquadEntry(false);
                        }}
                        style={{ width: '100%', padding: '16px', borderRadius: '16px', backgroundColor: '#4338ca', color: 'white', fontSize: '16px', fontWeight: '900', border: 'none', cursor: squadHasErrors ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 8px 25px rgba(67, 56, 202, 0.25)', opacity: squadHasErrors ? 0.5 : 1 }}
                    >
                        Save Squads & Continue <Save size={18} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: '20px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
            <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                        onClick={handleBack}
                        style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <ChevronLeft size={20} color="#1e1b4b" />
                    </div>
                    <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b', letterSpacing: '-0.5px' }}>Team Lineups</span>
                </div>
            </div>

            <div className="container animate-fade-in" style={{ padding: '20px' }}>
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                        Batting: <span style={{ color: '#4338ca' }}>{teamName}</span>
                    </div>
                    <div className="card" style={{ padding: '24px', borderRadius: '24px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.03)', position: 'relative', zIndex: 10 }}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Striker</label>
                            <NameInput
                                placeholder="Name of striker"
                                value={striker}
                                onChange={(val) => setStriker(val.toUpperCase())}
                                style={{ input: { height: '52px', borderRadius: '16px', border: strikerError ? '2px solid #ef4444' : '1.5px solid #f1f5f9', fontSize: '16px' } }}
                            />
                            {strikerError && (
                                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', marginTop: '6px' }}>{strikerError}</div>
                            )}
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Non-Striker</label>
                            <NameInput
                                placeholder="Name of non-striker"
                                value={nonStriker}
                                onChange={(val) => setNonStriker(val.toUpperCase())}
                                style={{ input: { height: '52px', borderRadius: '16px', border: nonStrikerError ? '2px solid #ef4444' : '1.5px solid #f1f5f9', fontSize: '16px' } }}
                            />
                            {nonStrikerError && (
                                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', marginTop: '6px' }}>{nonStrikerError}</div>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
                        Bowling: <span style={{ color: '#ef4444' }}>{bowlingTeamName}</span>
                    </div>
                    <div className="card" style={{ padding: '24px', borderRadius: '24px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.03)', position: 'relative', zIndex: 5 }}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Opening Bowler</label>
                            <NameInput
                                placeholder="Name of opening bowler"
                                value={bowler}
                                onChange={(val) => setBowler(val.toUpperCase())}
                                style={{ input: { height: '52px', borderRadius: '16px', border: bowlerError ? '2px solid #ef4444' : '1.5px solid #f1f5f9', fontSize: '16px' } }}
                            />
                            {bowlerError && (
                                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', marginTop: '6px' }}>{bowlerError}</div>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ position: 'relative' }}>
                    <button id="autofill-players" onClick={() => { setStriker('Virat'); setNonStriker('Rohit'); setBowler('Bumrah'); setTimeout(handleStartInnings, 100); }} style={{ position: 'absolute', top: '-110px', right: 0, padding: '4px 8px', fontSize: '11px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>🤖 Autofill</button>
                    <motion.button
                        id="start-match-btn"
                        className="primary tap"
                        onClick={() => {
                            triggerHaptic('success');
                            handleStartInnings();
                        }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                        disabled={isStartDisabled}
                        style={{
                            height: '68px',
                            width: '100%',
                            fontSize: '17px',
                            fontWeight: '900',
                            letterSpacing: '1.5px',
                            borderRadius: '24px',
                            background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                            boxShadow: '0 12px 30px rgba(30, 27, 75, 0.25)',
                            opacity: isStartDisabled ? 0.5 : 1,
                            cursor: isStartDisabled ? 'not-allowed' : 'pointer',
                            pointerEvents: isStartDisabled ? 'none' : 'auto'
                        }}
                    >
                        🏏 START MATCH
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default PlayerEntry;
