import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft } from 'lucide-react';
import NameInput from '../components/NameInput';
import { sanitizeNumber } from '../utils/sanitize';
import { clearMatchCache } from '../utils/dataFetcher';
import { buildOwnerIdentity, canCreateMatch, getCurrentSession } from '../utils/matchPermissions';

import { triggerHaptic } from '../utils/haptics';
import { SPRING_PRESET, SPRING_BOUNCE } from '../utils/animationPresets';

const NewMatch = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { state, dispatch } = useMatch();

    const locationState = location.state || {};
    const { fromTournament, tournamentId, tournamentMatchId, team1Name, team2Name, team1Players, team2Players, overs: defaultOvers, isTournamentMatch } = locationState;

    const [team1, setTeam1] = useState(team1Name || '');
    const [team2, setTeam2] = useState(team2Name || '');
    const [tossWinner, setTossWinner] = useState('');
    const [batFirst, setBatFirst] = useState('');
    const [overs, setOvers] = useState(defaultOvers ? String(defaultOvers) : '5');
    const [isStarting, setIsStarting] = useState(false);


    const handleStart = () => {
        if (!team1 || !team2 || isStarting) {
            return;
        }

        triggerHaptic('success');
        setIsStarting(true);

        setTimeout(() => {
            clearMatchCache();

            const finalOvers = overs === '' ? 5 : parseInt(typeof overs === 'string' ? overs.trim() : overs);
            const tWinner = tossWinner;
            const bFirst = batFirst;
            const bSecond = bFirst === team1 ? team2 : team1;

            const session = getCurrentSession();
            const ownerIdentity = buildOwnerIdentity(session);

            dispatch({
                type: 'INIT_MATCH',
                payload: {
                    matchId: fromTournament ? tournamentMatchId : `MATCH-${Date.now()}`,
                    tournamentId: tournamentId || null,
                    isTournamentMatch: !!isTournamentMatch,
                    startTime: Date.now(),
                    createdByUid: ownerIdentity.createdByUid,
                    createdByEmail: ownerIdentity.createdByEmail,
                    ownerLoginType: ownerIdentity.ownerLoginType,
                    team1: { name: team1.trim(), score: 0, wickets: 0, overs: 0, balls: 0 },
                    team2: { name: team2.trim(), score: 0, wickets: 0, overs: 0, balls: 0 },
                    tossWinner: tWinner,
                    batFirst: bFirst,
                    totalOvers: finalOvers > 9999 ? 9999 : finalOvers < 1 ? 1 : finalOvers,
                    matchStatus: 'setup',
                    currentInnings: 1,
                    innings: [
                        {
                            battingTeam: bFirst,
                            bowlingTeam: bSecond,
                            runs: 0, wickets: 0, balls: 0, overs: 0,
                            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                            batsmen: [], bowlers: [], partnerships: [], fallOfWickets: [], timeline: [], thisOver: []
                        },
                        {
                            battingTeam: bSecond,
                            bowlingTeam: bFirst,
                            runs: 0, wickets: 0, balls: 0, overs: 0,
                            extras: { byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 },
                            batsmen: [], bowlers: [], partnerships: [], fallOfWickets: [], timeline: [], thisOver: []
                        }
                    ]
                }
            });

            navigate('/player-entry', { state: { fromTournament, team1Players, team2Players } });
        }, 220);
    };

    return (
        <div style={{ paddingBottom: '20px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
            <div className="header" style={{ padding: '0 20px', height: '64px', border: 'none', background: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <motion.div
                        whileTap={{ scale: 0.9 }}
                        onClick={() => { triggerHaptic('light'); navigate(-1); }}
                        style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <ChevronLeft size={20} color="#1e1b4b" />
                    </motion.div>
                    <span style={{ fontWeight: '900', fontSize: '18px', color: '#1e1b4b', letterSpacing: '-0.5px' }}>Match Setup</span>
                </div>
            </div>

            <div className="container animate-fade-in" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
                <div className="card" style={{ padding: '16px', borderRadius: '20px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: '12px', position: 'relative', zIndex: 10 }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8' }}>Opponent Teams</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {fromTournament ? (
                            <>
                                <div style={{ height: '44px', borderRadius: '12px', border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', padding: '0 16px', background: '#f8fafc', color: '#64748b', fontWeight: '800' }}>{team1Name}</div>
                                <div style={{ height: '44px', borderRadius: '12px', border: '1.5px solid #f1f5f9', display: 'flex', alignItems: 'center', padding: '0 16px', background: '#f8fafc', color: '#64748b', fontWeight: '800' }}>{team2Name}</div>
                            </>
                        ) : (
                            <>
                                <NameInput className="premium-input" placeholder="Team 1 Name" value={team1} onChange={(val) => setTeam1(val.toUpperCase())} style={{ input: { height: '44px', borderRadius: '12px', border: '1.5px solid #f1f5f9' } }} />
                                <NameInput className="premium-input" placeholder="Team 2 Name" value={team2} onChange={(val) => setTeam2(val.toUpperCase())} style={{ input: { height: '44px', borderRadius: '12px', border: '1.5px solid #f1f5f9' } }} />
                            </>
                        )}
                    </div>
                </div>

                <div className="card" style={{ padding: '16px', borderRadius: '20px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: '12px', position: 'relative', zIndex: 9 }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8' }}>Toss Winner</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {[team1 || 'Team 1', team2 || 'Team 2'].map((t, i) => {
                            const isSelected = tossWinner === t;
                            return (
                                <motion.label
                                    key={i}
                                    whileTap={{ scale: 0.96 }}
                                    animate={{
                                        backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                                        borderColor: isSelected ? '#4338ca' : '#e2e8f0',
                                        color: isSelected ? '#4338ca' : '#64748b',
                                        boxShadow: isSelected ? '0 0 15px rgba(67, 56, 202, 0.25)' : 'none'
                                    }}
                                    transition={SPRING_PRESET}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', borderRadius: '14px', border: '2px solid #e2e8f0', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
                                    onClick={() => triggerHaptic('light')}
                                >
                                    <input type="radio" name="toss" checked={isSelected} onChange={() => setTossWinner(t)} style={{ display: 'none' }} />
                                    <span>{t}</span>
                                </motion.label>
                            );
                        })}
                    </div>
                </div>

                <div className="card" style={{ padding: '16px', borderRadius: '20px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: '12px', position: 'relative', zIndex: 8 }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8' }}>Elected to Bat First?</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {[team1 || 'Team 1', team2 || 'Team 2'].map((t, i) => {
                            const isSelected = batFirst === t;
                            return (
                                <motion.label
                                    key={i}
                                    whileTap={{ scale: 0.96 }}
                                    animate={{
                                        backgroundColor: isSelected ? '#eef2ff' : '#ffffff',
                                        borderColor: isSelected ? '#4338ca' : '#e2e8f0',
                                        color: isSelected ? '#4338ca' : '#64748b',
                                        boxShadow: isSelected ? '0 0 15px rgba(67, 56, 202, 0.25)' : 'none'
                                    }}
                                    transition={SPRING_PRESET}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', borderRadius: '14px', border: '2px solid #e2e8f0', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}
                                    onClick={() => triggerHaptic('light')}
                                >
                                    <input type="radio" name="bat" checked={isSelected} onChange={() => setBatFirst(t)} style={{ display: 'none' }} />
                                    <span>{t}</span>
                                </motion.label>
                            );
                        })}
                    </div>
                </div>

                <div className="card" style={{ padding: '16px', borderRadius: '20px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', marginBottom: '16px' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', color: '#94a3b8' }}>Match Overs</h3>
                    <input 
                      type="number" 
                      placeholder="Number of overs" 
                      value={overs} 
                      onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') { setOvers(''); return; }
                          setOvers(sanitizeNumber(val, 1, 100).toString());
                      }} 
                      min="1" 
                      max="100" 
                      maxLength={4}
                      inputMode="numeric"
                      style={{ width: '100%', height: '44px', borderRadius: '12px', border: '1.5px solid #f1f5f9', fontWeight: '900', fontSize: '18px', textAlign: 'center' }} 
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>

                    <motion.button
                        id="start-match-btn"
                        className="primary tap"
                        onClick={handleStart}
                        whileTap={{ scale: 0.94 }}
                        whileHover={{ scale: 1.02 }}
                        animate={isStarting ? { scale: [1, 1.04, 0.98, 1], transition: { duration: 0.25 } } : {}}
                        transition={SPRING_BOUNCE}
                        disabled={!team1.trim() || !team2.trim() || team1.trim().toLowerCase() === team2.trim().toLowerCase() || !tossWinner || !batFirst || isStarting}
                        style={{
                            height: '56px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                            color: 'white',
                            fontSize: '15px',
                            fontWeight: '900',
                            letterSpacing: '1px',
                            boxShadow: '0 8px 25px rgba(30, 27, 75, 0.2)',
                            opacity: (!team1 || !team2 || !tossWinner || !batFirst) ? 0.5 : 1,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        {isStarting ? (
                            <span>✨ PREPARING MATCH...</span>
                        ) : (
                            <span>🏏 START MATCH</span>
                        )}
                    </motion.button>
                    <button onClick={() => { triggerHaptic('light'); navigate('/match-settings'); }} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '13px', fontWeight: '700', marginTop: '8px', cursor: 'pointer' }}>⚙️ Advanced Rules & Settings</button>
                </div>
            </div>
        </div>
    );
};

export default NewMatch;
