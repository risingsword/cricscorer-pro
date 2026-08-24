import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import confetti from 'canvas-confetti';
import NameInput from '../components/NameInput';
import { updateTournamentMatch } from '../utils/tournamentLogic';

const Congratulations = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [manualMotm, setManualMotm] = useState(state.manOfMatch?.name || '');

    // Man of the Match is purely derived from match state, so compute it during
    // render instead of storing it in state and syncing via an effect (that was
    // the set-state-in-effect anti-pattern — an unnecessary extra render cascade).
    const motm = (state?.manOfMatch?.name && state.manOfMatch.name !== 'TBA')
        ? state.manOfMatch
        : (state.innings ? state.manOfMatch : null);

    useEffect(() => {
        // Fire confetti on the winning screen
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#4f46e5', '#f43f5e', '#10b981', '#f59e0b']
        });

        // Persist the finished result into the tournament bracket, if applicable
        if (state?.tournamentId && state?.matchId && state.matchStatus === 'complete') {
            updateTournamentMatch(state.tournamentId, state.matchId, state);
        }
    }, [state]);

    const handleMotmChange = (val) => {
        setManualMotm(val);
        dispatch({ 
            type: 'UPDATE_STATE', 
            payload: { 
                manOfMatch: { 
                    ...(state.manOfMatch || {}), 
                    name: val 
                } 
            } 
        });
    };

    // Helper to get top 2 performing players for a team
    const getTopPerformers = (teamName) => {
        if (!teamName) return [];
        const players = {};
        (state.innings || []).forEach(inn => {
            if (!inn) return;
            if (inn.battingTeam === teamName) {
                (inn.batsmen || []).forEach(b => {
                    const name = b.name?.trim();
                    if (!name) return;
                    if (!players[name]) players[name] = { name, runs: 0, balls: 0, wickets: 0, bowlRuns: 0 };
                    players[name].runs += Number(b.runs || 0);
                    players[name].balls += Number(b.balls || 0);
                });
            }
            if (inn.bowlingTeam === teamName) {
                (inn.bowlers || []).forEach(b => {
                    const name = b.name?.trim();
                    if (!name) return;
                    if (!players[name]) players[name] = { name, runs: 0, balls: 0, wickets: 0, bowlRuns: 0 };
                    players[name].wickets += Number(b.wickets || 0);
                    players[name].bowlRuns += Number(b.runs || 0);
                });
            }
        });
        return Object.values(players).map(p => {
            const score = p.runs + (p.wickets * 25);
            const isBatting = p.runs > 0 && (p.wickets === 0 || p.runs >= p.wickets * 15);
            const statText = isBatting 
                ? `${p.runs}${p.balls > 0 ? `(${p.balls}b)` : ''}`
                : `${p.wickets} wkts${p.bowlRuns > 0 ? ` (${p.bowlRuns}r)` : ''}`;
            return { name: p.name, score, statText };
        }).sort((a, b) => b.score - a.score).slice(0, 2);
    };

    const inn1Idx = (state.currentInnings && state.currentInnings > 2) ? state.currentInnings - 2 : 0;
    const inn2Idx = (state.currentInnings && state.currentInnings > 2) ? state.currentInnings - 1 : 1;

    const team1Name = state.innings?.[inn1Idx]?.battingTeam || state.team1?.name || 'Innings 1';
    const team2Name = state.innings?.[inn2Idx]?.battingTeam || state.team2?.name || 'Innings 2';
    const team1Performers = getTopPerformers(team1Name);
    const team2Performers = getTopPerformers(team2Name);

    return (
        <div style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            background: 'linear-gradient(180deg, #090a1a 0%, #151630 100%)', 
            padding: '24px',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Ambient Ambient Glows */}
            <div style={{ position: 'absolute', top: '10%', left: '-80px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(67, 56, 202, 0.4)', filter: 'blur(70px)', zIndex: 0 }} />
            <div style={{ position: 'absolute', bottom: '15%', right: '-80px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(219, 39, 119, 0.25)', filter: 'blur(70px)', zIndex: 0 }} />

            <div style={{ zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ marginTop: '30px', textAlign: 'center' }} className="animate-fade-in">
                    <div style={{ fontSize: '70px', animation: 'float 4s ease-in-out infinite', filter: 'drop-shadow(0 15px 25px rgba(245, 158, 11, 0.4))' }}>🏆</div>
                    <h1 style={{ 
                        color: 'white', 
                        fontSize: '28px', 
                        fontWeight: '900', 
                        marginTop: '12px',
                        lineHeight: '1.2', 
                        background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)', 
                        WebkitBackgroundClip: 'text', 
                        WebkitTextFillColor: 'transparent',
                        textShadow: '0 4px 15px rgba(0,0,0,0.2)'
                    }}>
                        {state.winner === 'Tie' ? 'Match Tied! 🤝' : `${state.winner} won by ${state.winMargin} ${state.winType}!`}
                    </h1>
                </div>

                {/* Match Summary Card */}
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', width: '100%', maxWidth: '420px', marginTop: '24px' }}>
                    <h3 style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', textAlign: 'center', marginBottom: '16px', fontWeight: '700' }}>Match Summary</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Team 1 */}
                        {team1Name && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                             <div style={{ flex: 1 }}>
                                 <div style={{ color: 'white', fontWeight: '800', fontSize: '15px' }}>{team1Name}</div>
                                 <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                     {team1Performers.map((p, i) => (
                                         <div key={i} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>{p.name}: <span style={{color: '#fed7aa', fontWeight: '700'}}>{p.statText}</span></div>
                                     ))}
                                 </div>
                             </div>
                             <div style={{ color: 'white', fontWeight: '900', fontSize: '18px', marginLeft: '12px' }}>{state.innings[inn1Idx]?.runs}/{state.innings[inn1Idx]?.wickets || 0}</div>
                        </div>
                        )}

                        {/* Team 2 */}
                        {team2Name && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div style={{ flex: 1 }}>
                                 <div style={{ color: 'white', fontWeight: '800', fontSize: '15px' }}>{team2Name}</div>
                                 <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                     {team2Performers.map((p, i) => (
                                         <div key={i} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>{p.name}: <span style={{color: '#fed7aa', fontWeight: '700'}}>{p.statText}</span></div>
                                     ))}
                                 </div>
                             </div>
                             <div style={{ color: 'white', fontWeight: '900', fontSize: '18px', marginLeft: '12px' }}>{state.innings[inn2Idx]?.runs || 0}/{state.innings[inn2Idx]?.wickets || 0}</div>
                        </div>
                        )}
                    </div>
                </div>

                {/* Man of the Match Row */}
                {motm && motm.name !== 'TBA' ? (
                    <div style={{ width: '100%', maxWidth: '420px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', borderRadius: '16px', boxShadow: '0 10px 25px rgba(245, 158, 11, 0.25)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: 'white', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '18px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                                {motm.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                 <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '800' }}>⭐ Man of the Match</div>
                                 <div style={{ color: 'white', fontWeight: '900', fontSize: '17px', letterSpacing: '0.3px' }}>{motm.name.toUpperCase()}</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '12px', color: 'white', fontWeight: '700', opacity: 0.9 }}>
                            {motm.batting?.runs > 0 ? `${motm.batting.runs}(${motm.batting.balls}) ` : ''}
                            {motm.bowling?.wickets > 0 ? `${motm.bowling.wickets} wkts` : ''}
                        </div>
                    </div>
                ) : (
                    <div style={{ width: '100%', maxWidth: '420px', marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
                         <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginBottom: '10px' }}>Select Man of the Match</div>
                         <NameInput 
                              value={manualMotm}
                              onChange={handleMotmChange}
                              placeholder="Type player name..."
                              style={{ 
                                  input: { 
                                      height: '44px', 
                                      borderRadius: '12px', 
                                      backgroundColor: 'rgba(255,255,255,0.08)', 
                                      color: 'white', 
                                      border: '1px solid rgba(255,255,255,0.12)',
                                      fontSize: '14px'
                                  } 
                              }}
                         />
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '420px', marginTop: '30px' }}>
                    {state.winner === 'Tie' && (
                        <button className="btn-scale animate-pulse" style={{ backgroundColor: '#10b981', color: 'white', height: '54px', borderRadius: '16px', fontWeight: '900', fontSize: '15px', border: 'none', cursor: 'pointer', boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)', transition: 'all 0.2s ease', marginBottom: '8px' }} onClick={() => { dispatch({ type: 'START_SUPER_OVER' }); navigate('/player-entry'); }}>Start Super Over 🏏</button>
                    )}
                    <button className="btn-scale" style={{ backgroundColor: 'white', color: '#1e1b4b', height: '54px', borderRadius: '16px', fontWeight: '800', fontSize: '15px', border: 'none', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(0,0,0,0.3)', transition: 'all 0.2s ease' }} onClick={() => navigate('/history')}>View Scorecard</button>
                    <button className="btn-scale" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', height: '54px', borderRadius: '16px', fontWeight: '800', fontSize: '15px', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s ease' }} onClick={() => navigate('/home')}>New Match</button>
                </div>
            </div>

            <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .btn-scale:active {
          transform: scale(0.97);
        }
      `}</style>
        </div>
    );
};

export default Congratulations;
