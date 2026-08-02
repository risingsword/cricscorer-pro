import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { Home, ChevronLeft } from 'lucide-react';

const InningsBreak = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [started, setStarted] = useState(false);

    // ── SAFE HOME NAVIGATION ──
    const handleGoHome = () => navigate('/home');

    // ── BACK TO LIVE SCORING (1st innings) ──
    // skipBreakRedirect flag tells LiveScoring NOT to auto-redirect back here.
    const handleGoBack = () => navigate('/live-scoring', { state: { skipBreakRedirect: true } });

    // ── CAPACITOR HARDWARE BACK BUTTON ──
    // On Android, pressing back on this screen goes to Home (not back into live scoring).
    useEffect(() => {
        let cleanup = null;

        // Runtime check: only runs on the native Capacitor device build.
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            const CapApp = window.Capacitor.Plugins?.App;
            if (CapApp && typeof CapApp.addListener === 'function') {
                let handle = null;
                CapApp.addListener('backButton', () => { handleGoBack(); })
                    .then(h => { handle = h; })
                    .catch(() => { });
                cleanup = () => {
                    if (handle && typeof handle.remove === 'function') handle.remove();
                };
            }
        }

        return () => { if (cleanup) cleanup(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── EARLY NULL GUARD ──
    // If the match state is not ready (e.g. app restarted mid-flow or React batching delays), 
    // wait briefly before redirecting to home safely.
    useEffect(() => {
        if (!state.matchId || !state.innings?.[0]) {
            const timer = setTimeout(() => {
                navigate('/home', { replace: true });
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [state.matchId, state.innings, navigate]);

    if (!state.matchId || !state.innings?.[0]) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', color: '#64748b', fontWeight: '800' }}>Loading match state...</div>;
    }

    // Always use index 0 for 1st innings — innings_break only happens after 1st innings
    const inn1 = state.innings[0] || {};
    const battingTeam2 = inn1.bowlingTeam || '';
    const bowlingTeam2 = inn1.battingTeam || '';
    const target = inn1.runs != null ? inn1.runs + 1 : 1;
    const team2 = battingTeam2;

    const handleStartSecondInnings = () => {
        // Hard guards — prevent double-click / re-render race condition
        if (started) return;
        if (state.matchStatus !== 'innings_break') return;

        setStarted(true);

        // Always use index 1 for 2nd innings — never allow 3+ innings to be created here
        const newInnings = [state.innings[0]]; // Keep ONLY 1st innings, discard any corrupt extras
        newInnings[1] = {
            battingTeam: battingTeam2,
            bowlingTeam: bowlingTeam2,
            runs: 0, wickets: 0, balls: 0, overs: 0,
            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
            batsmen: [], bowlers: [], timeline: [], thisOver: [],
            partnerships: [], fallOfWickets: [], overTimestamps: []
        };

        dispatch({
            type: 'UPDATE_STATE',
            payload: {
                currentInnings: 2,
                target,
                lastOverBowler: null,
                innings: newInnings,
                matchStatus: 'innings_break' // Stays innings_break until PlayerEntry sets it to live
            }
        });
        navigate('/player-entry');
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: '#f8fafc' }}>
            <div className="card animate-fade-in" style={{ position: 'relative', width: '100%', maxWidth: '400px', textAlign: 'center', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)', borderRadius: '24px', background: 'white' }}>

                {/* Back to 1st innings live scoring */}
                <div
                    onClick={handleGoBack}
                    title="Back to 1st innings"
                    style={{ position: 'absolute', top: '16px', left: '16px', cursor: 'pointer', padding: '8px', borderRadius: '12px', background: 'rgba(79, 70, 229, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                >
                    <ChevronLeft size={18} color="#4f46e5" />
                </div>

                {/* Home shortcut */}
                <div
                    onClick={handleGoHome}
                    style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', padding: '8px', borderRadius: '12px', background: 'rgba(79, 70, 229, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                >
                    <Home size={18} color="#4f46e5" />
                </div>

                <div style={{ fontSize: '56px', marginBottom: '16px', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>🎯</div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Innings Break!</h2>
                <h1 style={{ fontSize: '64px', fontWeight: '800', marginBottom: '8px', lineHeight: '1', color: '#1e1b4b' }}>{target}</h1>
                <p style={{ color: '#64748b', fontSize: '16px', fontWeight: '600', marginBottom: '32px', textTransform: 'uppercase', letterSpacing: '2px' }}>Runs to win</p>

                <div style={{ width: '100%', padding: '16px', backgroundColor: 'rgba(79, 70, 229, 0.05)', borderRadius: '16px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(79, 70, 229, 0.1)' }}>
                        <span style={{ color: '#64748b', fontWeight: '600', fontSize: '14px' }}>Chasing Team</span>
                        <span style={{ fontWeight: '800', color: '#1e1b4b', fontSize: '15px' }}>{team2}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(79, 70, 229, 0.1)' }}>
                        <span style={{ color: '#64748b', fontWeight: '600', fontSize: '14px' }}>Overs Available</span>
                        <span style={{ fontWeight: '800', color: '#1e1b4b', fontSize: '15px' }}>{state.totalOvers || 'Unlimited'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b', fontWeight: '600', fontSize: '14px' }}>Required RR</span>
                        <span style={{ fontWeight: '800', color: '#ef4444', fontSize: '15px' }}>{state.totalOvers > 0 ? (target / state.totalOvers).toFixed(2) : '-'}</span>
                    </div>
                </div>

                <button
                    className="primary"
                    disabled={started}
                    onClick={handleStartSecondInnings}
                    style={{
                        width: '100%', height: '52px',
                        background: started ? '#94a3b8' : 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                        color: 'white', borderRadius: '16px', fontWeight: '800', fontSize: '15px',
                        border: 'none', cursor: started ? 'not-allowed' : 'pointer',
                        boxShadow: started ? 'none' : '0 10px 25px rgba(67, 56, 202, 0.2)',
                        transition: 'all 0.2s'
                    }}
                >
                    {started ? 'Starting...' : 'Start 2nd Innings'}
                </button>
            </div>
        </div>
    );
};

export default InningsBreak;
