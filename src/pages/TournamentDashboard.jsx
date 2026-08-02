import React, { useState, useEffect } from 'react';
import useScrollRestore from '../hooks/useScrollRestore';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft, Trophy, Calendar, Users, Activity, PlayCircle, Eye, RefreshCw } from 'lucide-react';
import { calculateNRR, generateKnockoutFixtures, updatePointsTable } from '../utils/tournamentLogic';
import { sanitizeName, sanitizeNumber } from '../utils/sanitize';

const TournamentDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { dispatch, state: globalState } = useMatch();
    const [tournament, setTournament] = useState(null);
    const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem(`td_tab_${id}`) || 'Overview'); // Overview, Fixtures, Points, Knockout, Stats
    const [editingTeam, setEditingTeam] = useState(null);
    const [selectedStat, setSelectedStat] = useState(null);
    const [editTeamName, setEditTeamName] = useState('');
    
    // Players Management
    const [playersTeam, setPlayersTeam] = useState(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerRole, setNewPlayerRole] = useState('Batsman');
    const [subRole, setSubRole] = useState('');

    // Custom Match Creation
    const [showAddMatch, setShowAddMatch] = useState(false);
    const [customT1, setCustomT1] = useState('');
    const [customT2, setCustomT2] = useState('');
    const [customOvers, setCustomOvers] = useState('');

    useEffect(() => {
        const stored = localStorage.getItem('cricscore_tournaments');
        if (stored) {
            const parsed = JSON.parse(stored);
            const found = parsed.find(t => t.tournamentId === id);
            if (found) {
                setTournament(found);
                localStorage.setItem('cricscore_active_tournament', JSON.stringify(found));
            }
        }
    }, [id]);

    // Pre-paint scroll restoration — no flicker
    useScrollRestore(`tournament-${id}`);

    useEffect(() => {
        sessionStorage.setItem(`td_tab_${id}`, activeTab);
    }, [activeTab, id]);

    if (!tournament) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading Tournament...</div>;

    const completedMatches = tournament.matches.filter(m => m.status === 'completed');
    const totalMatches = tournament.matches.length;
    const progress = totalMatches > 0 ? (completedMatches.length / totalMatches) * 100 : 0;

    const handleDeleteMatch = async (matchId) => {
        if (!window.confirm("Are you sure you want to delete this match?")) return;

        const updatedMatches = tournament.matches.filter(m => m.matchId !== matchId);
        const updatedTournament = { ...tournament, matches: updatedMatches };
        setTournament(updatedTournament);

        // Save
        const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const idx = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
        if (idx !== -1) {
            stored[idx] = updatedTournament;
            localStorage.setItem('cricscore_tournaments', JSON.stringify(stored));
        }

        if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') {
             try { const { doc, setDoc } = await import('firebase/firestore'); await setDoc(doc(db, 'tournaments', tournament.tournamentId), updatedTournament); } catch (e) { }
        }
    };

    const handleApproveFixtures = async () => {
        const updatedTournament = { ...tournament, fixturesApproved: true };
        setTournament(updatedTournament);

        // Save to localStorage
        const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const idx = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
        if (idx !== -1) {
            stored[idx] = updatedTournament;
            localStorage.setItem('cricscore_tournaments', JSON.stringify(stored));
        }

        // Sync to Firestore
        if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') {
             try {
                  const { doc, setDoc } = await import('firebase/firestore');
                  await setDoc(doc(db, 'tournaments', tournament.tournamentId), updatedTournament);
             } catch (e) { }
        }
    };

    const handleStartMatch = (m) => {
        const t1 = tournament.teams.find(t => t.teamId === m.team1Id);
        const t2 = tournament.teams.find(t => t.teamId === m.team2Id);
        
        navigate('/new-match', { 
            state: { 
                fromTournament: true,
                tournamentId: tournament.tournamentId,
                tournamentMatchId: m.matchId,
                team1Name: m.team1Name,
                team2Name: m.team2Name,
                team1Players: t1 ? t1.players : [],
                team2Players: t2 ? t2.players : [],
                overs: tournament.overs,
                isTournamentMatch: true
            } 
        });
    };

    const renderOverviewTab = () => {
        const isApproved = tournament.fixturesApproved || completedMatches.length > 0;

        return (
            <div className="animate-fade-in">
                <div className="card" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Progress</div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {tournament.shareCode && (
                                <div style={{ fontSize: '11px', fontWeight: '800', color: '#fff', backgroundColor: '#e94560', padding: '4px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                                    Code: {tournament.shareCode}
                                </div>
                            )}
                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#4338ca' }}>{completedMatches.length}/{totalMatches}</div>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.5s' }}></div>
                    </div>
                    
                    <div style={{ display: 'flex', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>Format</div>
                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e1b4b', textTransform: 'capitalize' }}>{tournament.format.replace('_', ' ')}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>Teams</div>
                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e1b4b' }}>{tournament.teams.length}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700' }}>Overs</div>
                            <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e1b4b' }}>{tournament.overs || 'TBD'}</div>
                        </div>
                    </div>
                </div>

                {!isApproved && (
                    <div className="card" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', marginBottom: '24px', textAlign: 'center' }}>
                         <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>Fixture Approval Required</div>
                         <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '20px' }}>Approve auto-generated fixtures or add custom matches before starting.</p>
                         
                         <div style={{ display: 'flex', gap: '12px' }}>
                             <button onClick={() => setShowAddMatch(true)} style={{ flex: 1, padding: '12px', backgroundColor: '#eef2ff', color: '#4338ca', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Create Custom</button>
                             <button onClick={handleApproveFixtures} style={{ flex: 1, padding: '12px', backgroundColor: '#10b981', color: 'white', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Auto Fixture</button>
                         </div>
                    </div>
                )}

                {isApproved && tournament.matches.find(m => m.status === 'upcoming') && (
                    <button 
                        onClick={() => handleStartMatch(tournament.matches.find(m => m.status === 'upcoming'))}
                        style={{ width: '100%', padding: '16px', backgroundColor: '#e94560', color: 'white', fontWeight: '900', borderRadius: '16px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '24px', boxShadow: '0 8px 25px rgba(233, 69, 96, 0.2)' }}
                    >
                        ⚡ AUTO START MATCH
                    </button>
                )}

                {isApproved && completedMatches.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>Recent Results</h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                             {completedMatches.slice(-3).reverse().map((m, i) => (
                                 <div key={i} className="card" style={{ padding: '16px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                                     <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Match {m.matchNumber} &bull; {m.stage}</div>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '14px', color: '#1e1b4b', marginBottom: '4px' }}>
                                         <span>{m.team1Name}</span>
                                         <span>{m.team1Score?.runs || 0}/{m.team1Score?.wickets || 0}</span>
                                     </div>
                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '14px', color: '#1e1b4b', marginBottom: '8px' }}>
                                         <span>{m.team2Name}</span>
                                         <span>{m.team2Score?.runs || 0}/{m.team2Score?.wickets || 0}</span>
                                     </div>
                                     <div style={{ fontSize: '12px', fontWeight: '700', color: '#4338ca' }}>{m.result}</div>
                                 </div>
                             ))}
                        </div>
                    </div>
                )}
                
                {isApproved && (
                    <div style={{ marginBottom: '24px' }}>
                        <button 
                            onClick={() => setShowAddMatch(true)} 
                            style={{ width: '100%', padding: '16px', backgroundColor: '#eef2ff', color: '#4338ca', fontWeight: '900', borderRadius: '16px', border: '1.5px dashed #4338ca', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}
                        >
                            ➕ CREATE CUSTOM MATCH FIXTURE
                        </button>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>Upcoming</h3>
                        </div>
                        {tournament.matches.filter(m => m.status === 'upcoming').slice(0, 3).map((m, i) => (
                             <div key={i} className="card" style={{ padding: '16px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #f1f5f9', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                 <div>
                                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Match {m.matchNumber} &bull; {m.stage} {m.overs && `• ${m.overs} Overs`}</div>
                                    <div style={{ fontWeight: '800', fontSize: '14px', color: '#1e1b4b' }}>{m.team1Name} <span style={{ color: '#94a3b8', fontSize: '12px' }}>vs</span> {m.team2Name}</div>
                                 </div>
                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                     <button onClick={() => handleDeleteMatch(m.matchId)} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                         ✕
                                     </button>
                                     <button onClick={() => handleStartMatch(m)} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4338ca', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                         <PlayCircle size={24} />
                                     </button>
                                 </div>
                             </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const handleAddCustomMatch = async () => {
        if (!customT1 || !customT2 || customT1 === customT2) {
            alert("Please select two different teams.");
            return;
        }

        const t1 = tournament.teams.find(t => t.teamId === customT1);
        const t2 = tournament.teams.find(t => t.teamId === customT2);

        const newMatch = {
            matchId: `m_${Date.now()}`,
            matchNumber: tournament.matches.length + 1,
            stage: "Group", // Default stage
            team1Id: customT1,
            team1Name: t1.name,
            team2Id: customT2,
            team2Name: t2.name,
            status: "upcoming",
            result: "",
            overs: customOvers || tournament.overs || "5"
        };

        const updatedTournament = { ...tournament, matches: [...tournament.matches, newMatch], fixturesApproved: true };
        setTournament(updatedTournament);

        // Save to localStorage
        const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const idx = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
        if (idx !== -1) {
            stored[idx] = updatedTournament;
            localStorage.setItem('cricscore_tournaments', JSON.stringify(stored));
        }

        // Sync to Firestore
        if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') {
             try {
                  const { doc, setDoc } = await import('firebase/firestore');
                  await setDoc(doc(db, 'tournaments', tournament.tournamentId), updatedTournament);
             } catch (e) { }
        }

        setShowAddMatch(false);
        setCustomT1('');
        setCustomT2('');
        setCustomOvers('');
    };

    const renderFixturesTab = () => {
        const isApproved = tournament.fixturesApproved || completedMatches.length > 0;
        return (
            <div className="animate-fade-in" style={{ paddingBottom: '20px' }}>
                {!isApproved ? (
                    <div className="card" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', marginBottom: '24px', textAlign: 'center' }}>
                         <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>Fixture Approval Required</div>
                         <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '20px' }}>Approve auto-generated fixtures or add custom matches to proceed.</p>
                         <div style={{ display: 'flex', gap: '12px' }}>
                             <button onClick={() => setShowAddMatch(true)} style={{ flex: 1, padding: '12px', backgroundColor: '#eef2ff', color: '#4338ca', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Create Custom</button>
                             <button onClick={handleApproveFixtures} style={{ flex: 1, padding: '12px', backgroundColor: '#10b981', color: 'white', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer' }}>Approve All</button>
                         </div>
                    </div>
                ) : (
                    <>
                        <button 
                            onClick={() => setShowAddMatch(true)} 
                            style={{ width: '100%', padding: '14px', backgroundColor: '#eef2ff', color: '#4338ca', fontWeight: '800', borderRadius: '16px', border: '1.5px dashed #4338ca', marginBottom: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            ➕ CREATE CUSTOM MATCH FIXTURE
                        </button>

                        {tournament.matches.map((m, i) => (
                <div key={i} className="card" style={{ padding: '16px', backgroundColor: 'white', borderRadius: '20px', border: m.status === 'live' ? '2px solid #ef4444' : 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Match {m.matchNumber} • {m.stage}</div>
                        <span style={{ 
                            fontSize: '10px', fontWeight: '800', padding: '4px 8px', borderRadius: '20px', textTransform: 'uppercase',
                            backgroundColor: m.status === 'completed' ? '#f1f5f9' : m.status === 'live' ? '#fee2e2' : '#eef2ff',
                            color: m.status === 'completed' ? '#64748b' : m.status === 'live' ? '#ef4444' : '#4338ca'
                        }}>
                            {m.status}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px', fontWeight: '900', color: '#1e1b4b', marginBottom: '6px' }}>
                        <span>{m.team1Name}</span>
                        {m.status === 'completed' ? <span>{m.team1Score?.runs}/{m.team1Score?.wickets} <span style={{fontSize: '11px', color: '#94a3b8', fontWeight: '700'}}>({m.team1Score?.overs})</span></span> : null}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '16px', fontWeight: '900', color: '#1e1b4b', marginBottom: '12px' }}>
                        <span>{m.team2Name}</span>
                        {m.status === 'completed' ? <span>{m.team2Score?.runs}/{m.team2Score?.wickets} <span style={{fontSize: '11px', color: '#94a3b8', fontWeight: '700'}}>({m.team2Score?.overs})</span></span> : null}
                    </div>

                    {m.status === 'completed' && (
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#10b981', backgroundColor: '#dcfce7', padding: '8px', borderRadius: '8px', textAlign: 'center', marginBottom: '12px' }}>
                            {m.result}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {m.status === 'upcoming' && (
                            <button onClick={() => handleStartMatch(m)} style={{ flex: 1, padding: '12px', backgroundColor: '#e94560', color: 'white', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                <PlayCircle size={18} /> Start Match
                            </button>
                        )}
                        {m.status === 'completed' && (
                            <button onClick={() => {
                                // Normally we'd fetch score data, here just navigate to history or scorecard dummy
                                navigate('/history');
                            }} style={{ flex: 1, padding: '12px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: '800', borderRadius: '12px', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                <Eye size={18} /> View Scorecard
                            </button>
                        )}
                    </div>
                </div>
                ))}
                    </>
                )}
            </div>
        );
    };

    const renderPointsTab = () => {
        if (tournament.format === 'knockout') return <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>Points table is not applicable for Knockout format.</div>;
        
        const pt = tournament.pointsTable || [];
        
        let grouped = {};
        if (tournament.format === 'group_knockout') {
            pt.forEach(t => {
                if (!grouped[t.groupId]) grouped[t.groupId] = [];
                grouped[t.groupId].push(t);
            });
        } else {
            grouped = { 'All Teams': pt };
        }

        return (
            <div className="animate-fade-in" style={{ paddingBottom: '20px' }}>
                {Object.keys(grouped).map(gId => {
                    const groupName = tournament.format === 'group_knockout' ? tournament.groups.find(g => g.groupId === gId)?.name : gId;
                    return (
                        <div key={gId} style={{ marginBottom: '24px' }}>
                            {tournament.format === 'group_knockout' && <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#1e1b4b', marginBottom: '12px' }}>{groupName}</h3>}
                            <div style={{ backgroundColor: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', backgroundColor: '#f8fafc', padding: '12px 16px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                                    <div>Team</div>
                                    <div style={{ textAlign: 'center' }}>P</div>
                                    <div style={{ textAlign: 'center' }}>W</div>
                                    <div style={{ textAlign: 'center' }}>L</div>
                                    <div style={{ textAlign: 'center' }}>Pts</div>
                                    <div style={{ textAlign: 'right' }}>NRR</div>
                                </div>
                                {grouped[gId].map((t, idx) => (
                                    <div key={t.teamId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', padding: '16px', borderTop: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '700', color: '#1e1b4b', backgroundColor: idx < 2 && tournament.format === 'group_knockout' ? '#f0fdf4' : 'white' }}>
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.teamName}</div>
                                        <div style={{ textAlign: 'center' }}>{t.played}</div>
                                        <div style={{ textAlign: 'center', color: '#10b981' }}>{t.won}</div>
                                        <div style={{ textAlign: 'center', color: '#ef4444' }}>{t.lost}</div>
                                        <div style={{ textAlign: 'center', fontWeight: '900', color: '#4338ca' }}>{t.points}</div>
                                        <div style={{ textAlign: 'right' }}>{t.nrr > 0 ? `+${t.nrr}` : t.nrr}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        );
    };

    const renderKnockoutTab = () => {
        const knockouts = tournament.matches.filter(m => ['quarterfinal', 'semifinal', 'final'].includes(m.stage));
        if (knockouts.length === 0) return <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>Knockout stage has not begun or fixtures pending.</div>;

        const stages = ['quarterfinal', 'semifinal', 'final'];

        return (
            <div className="animate-fade-in" style={{ paddingBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ padding: '0 10px', display: 'flex', gap: '32px', minWidth: 'max-content', alignItems: 'center' }}>
                    {stages.map(stage => {
                        const stageMatches = knockouts.filter(m => m.stage === stage);
                        if (stageMatches.length === 0) return null;
                        return (
                            <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: '32px', minWidth: '220px', justifyContent: 'space-around' }}>
                                <div style={{ textAlign: 'center', fontWeight: '900', color: '#4338ca', textTransform: 'uppercase', marginBottom: '8px', fontSize: '13px', letterSpacing: '1px' }}>{stage}</div>
                                {stageMatches.map(m => (
                                    <div key={m.matchId} className="card" style={{ padding: '16px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', position: 'relative' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '800', color: m.winnerId === m.team1Id ? '#10b981' : '#1e1b4b', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.team1Name}</span>
                                            <span style={{ fontWeight: '800', color: '#64748b', fontSize: '12px', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>{m.team1Score?.runs || 0}/{m.team1Score?.wickets || 0}</span>
                                        </div>
                                        <div style={{ width: '100%', height: '1px', backgroundColor: '#f1f5f9', marginBottom: '12px' }}></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '800', color: m.winnerId === m.team2Id ? '#10b981' : '#1e1b4b', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.team2Name}</span>
                                            <span style={{ fontWeight: '800', color: '#64748b', fontSize: '12px', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>{m.team2Score?.runs || 0}/{m.team2Score?.wickets || 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    };

    const handleUpdateTeam = async () => {
        if (!editTeamName.trim() || !editingTeam) return;
        const updatedTeams = tournament.teams.map(t => t.teamId === editingTeam.teamId ? { ...t, name: editTeamName.toUpperCase() } : t);
        
        // Also update fixtures/matches where this team was assigned
        const updatedMatches = tournament.matches.map(m => {
            const updated = { ...m };
            if (m.team1Id === editingTeam.teamId) updated.team1Name = editTeamName.toUpperCase();
            if (m.team2Id === editingTeam.teamId) updated.team2Name = editTeamName.toUpperCase();
            return updated;
        });

        const updatedTournament = { ...tournament, teams: updatedTeams, matches: updatedMatches };
        setTournament(updatedTournament);
        
        // Save to localStorage
        const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const idx = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
        if (idx !== -1) {
            stored[idx] = updatedTournament;
            localStorage.setItem('cricscore_tournaments', JSON.stringify(stored));
        }

        // Sync to Firestore
        if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') {
             try {
                  const { doc, setDoc } = await import('firebase/firestore');
                  await setDoc(doc(db, 'tournaments', tournament.tournamentId), updatedTournament);
             } catch (e) { }
        }

        setEditingTeam(null);
    };

    const handleAddPlayer = async () => {
        if (!newPlayerName.trim() || !playersTeam) return;

        const isDuplicate = playersTeam.players.some(p => p.name.toUpperCase() === newPlayerName.trim().toUpperCase());
        if (isDuplicate) {
            alert("A player with this name already exists in the team.");
            return;
        }
        
        const updatedTeams = tournament.teams.map(t => {
            if (t.teamId === playersTeam.teamId) {
                const pRole = subRole ? `${newPlayerRole} (${subRole})` : newPlayerRole;
                return { ...t, players: [...t.players, { name: newPlayerName.toUpperCase(), role: pRole }] };
            }
            return t;
        });

        const updatedTournament = { ...tournament, teams: updatedTeams };
        setTournament(updatedTournament);
        setPlayersTeam(updatedTournament.teams.find(t => t.teamId === playersTeam.teamId));

        // Save to localStorage
        const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const idx = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
        if (idx !== -1) {
            stored[idx] = updatedTournament;
            localStorage.setItem('cricscore_tournaments', JSON.stringify(stored));
        }

        // Sync to Firestore
        if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') {
             try {
                  const { doc, setDoc } = await import('firebase/firestore');
                  await setDoc(doc(db, 'tournaments', tournament.tournamentId), updatedTournament);
             } catch (e) { }
        }

        setNewPlayerName('');
        setNewPlayerRole('Batsman');
        setSubRole('');
    };

    const renderTeamsTab = () => (
        <div className="animate-fade-in" style={{ paddingBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tournament.teams.map((t, idx) => (
                    <div key={idx} className="card" onClick={() => setPlayersTeam(t)} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer' }}>
                        <div>
                            <div style={{ fontWeight: '800', fontSize: '15px', color: '#1e1b4b' }}>{t.name}</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{t.players.length} Players Added</div>
                            <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: '800', fontStyle: 'italic', marginTop: '4px' }}>Tap to add players 👆</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setEditingTeam(t); setEditTeamName(t.name); }} style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', backgroundColor: 'transparent', color: '#475569', fontWeight: '800', cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                    </div>
                ))}
            </div>

        </div>
    );

    const renderStatsTab = () => {
        const categories = [
            { title: 'BATTING', items: ['Most Runs', 'Highest Scores', 'Best Strike Rate', 'Most Sixes', 'Most Fours'] },
            { title: 'BOWLING', items: ['Most Wickets', 'Best Economy', 'Most 5 Wicket Hauls'] }
        ];

        const computeStats = () => {
            const players = {};
            if (!tournament || !tournament.matches) return [];
            
            tournament.matches.forEach(m => {
                if (m.status !== 'completed' || !m.innings) return;
                m.innings.forEach(inn => {
                    // Update Batting
                    inn.batsmen.forEach(b => {
                        const name = b.name.trim();
                        if (!players[name]) players[name] = { name, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, wickets: 0, runsCon: 0, ballsBowled: 0, highestScore: 0, fiveWkts: 0 };
                        
                        players[name].runs += b.runs || 0;
                        players[name].balls += b.balls || 0;
                        if (b.isOut) players[name].outs += 1;
                        players[name].fours += b.fours || 0;
                        players[name].sixes += b.sixes || 0;
                        if (b.runs > players[name].highestScore) players[name].highestScore = b.runs;
                    });
                    
                    // Update Bowling
                    inn.bowlers.forEach(b => {
                        const name = b.name.trim();
                        if (!players[name]) players[name] = { name, runs: 0, balls: 0, outs: 0, fours: 0, sixes: 0, wickets: 0, runsCon: 0, ballsBowled: 0, highestScore: 0, fiveWkts: 0 };
                        
                        players[name].wickets += b.wickets || 0;
                        players[name].runsCon += b.runs || 0;
                        const bballs = Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10);
                        players[name].ballsBowled += bballs;
                        if (b.wickets >= 5) players[name].fiveWkts += 1;
                    });
                });
            });
            return Object.values(players);
        };

        const getStatList = (pList) => {
            if (!pList) return [];
            let sorted = [];
            switch (selectedStat) {
                case 'Most Runs':
                    sorted = pList.sort((a,b) => b.runs - a.runs);
                    return sorted.map(p => ({ name: p.name, value: p.runs, sub: `${p.balls} Balls` }));
                case 'Highest Scores':
                    sorted = pList.sort((a,b) => b.highestScore - a.highestScore);
                    return sorted.map(p => ({ name: p.name, value: p.highestScore }));
                case 'Best Strike Rate':
                    sorted = pList.filter(p => p.balls >= 12).sort((a,b) => (b.runs/b.balls) - (a.runs/a.balls));
                    return sorted.map(p => ({ name: p.name, value: ((p.runs/Math.max(1, p.balls))*100).toFixed(1), sub: 'SR' }));
                case 'Most Sixes':
                    return pList.sort((a,b) => b.sixes - a.sixes).map(p => ({ name: p.name, value: p.sixes }));
                case 'Most Fours':
                    return pList.sort((a,b) => b.fours - a.fours).map(p => ({ name: p.name, value: p.fours }));
                case 'Most Wickets':
                    return pList.sort((a,b) => b.wickets - a.wickets).map(p => ({ name: p.name, value: p.wickets }));
                case 'Best Economy':
                    sorted = pList.filter(p => p.ballsBowled >= 6).sort((a,b) => (a.runsCon/a.ballsBowled) - (b.runsCon/b.ballsBowled));
                    return sorted.map(p => ({ name: p.name, value: ((p.runsCon/Math.max(1, p.ballsBowled))*6).toFixed(2), sub: 'Eco' }));
                case 'Most 5 Wicket Hauls':
                    return pList.sort((a,b) => b.fiveWkts - a.fiveWkts).map(p => ({ name: p.name, value: p.fiveWkts }));
                default: return [];
            }
        };

        if (selectedStat) {
            const data = getStatList(computeStats());
            return (
                <div className="animate-fade-in" style={{ paddingBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <button onClick={() => setSelectedStat(null)} style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <ChevronLeft size={16} color="#1e1b4b" />
                        </button>
                        <h3 style={{ fontSize: '15px', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>{selectedStat}</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontWeight: '800' }}>No Data Available</div>
                        ) : (
                            data.map((p, idx) => (
                                <div key={idx} className="card" style={{ backgroundColor: 'white', padding: '14px 16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '8px', backgroundColor: idx === 0 ? '#fef3c7' : '#f1f5f9', color: idx === 0 ? '#d97706' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900' }}>{idx + 1}</div>
                                        <div style={{ fontWeight: '800', color: '#1e1b4b', fontSize: '14px' }}>{p.name}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '900', color: '#4338ca', fontSize: '15px' }}>{p.value}</div>
                                        {p.sub && <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700' }}>{p.sub}</div>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="animate-fade-in" style={{ paddingBottom: '20px' }}>
                {categories.map((c, idx) => (
                    <div key={idx} style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', paddingLeft: '4px' }}>{c.title}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {c.items.map((item, iIdx) => (
                                <div key={iIdx} onClick={() => setSelectedStat(item)} className="card" style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                    <span style={{ fontWeight: '800', color: '#1e1b4b', fontSize: '14px' }}>{item}</span>
                                    <ChevronLeft size={16} color="#94a3b8" style={{ transform: 'rotate(180deg)' }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
            <div style={{ backgroundColor: '#1e1b4b', color: 'white', padding: '20px 20px 0 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div onClick={() => selectedStat ? setSelectedStat(null) : navigate(-1)} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ChevronLeft size={24} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Tournament</div>
                        <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tournament.name}</h2>
                    </div>
                </div>

                <div style={{ display: 'flex', overflowX: 'auto', gap: '24px', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                    {['Overview', 'Teams', 'Fixtures', 'Points', 'Knockout', 'Stats'].map(tab => {
                        // Hide knockout/points for unsupported formats if needed
                        if (tab === 'Points' && tournament.format === 'knockout') return null;
                        if (tab === 'Knockout' && tournament.format === 'roundrobin') return null;

                        return (
                            <div 
                                key={tab} 
                                onClick={() => setActiveTab(tab)}
                                style={{ 
                                    paddingBottom: '16px', 
                                    fontSize: '14px', 
                                    fontWeight: '800', 
                                    color: activeTab === tab ? 'white' : '#6366f1',
                                    borderBottom: activeTab === tab ? '3px solid #10b981' : '3px solid transparent',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {tab}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                {activeTab === 'Overview' && renderOverviewTab()}
                {activeTab === 'Teams' && renderTeamsTab()}
                {activeTab === 'Fixtures' && renderFixturesTab()}
                {activeTab === 'Points' && renderPointsTab()}
                {activeTab === 'Knockout' && renderKnockoutTab()}
                {activeTab === 'Stats' && renderStatsTab()}

                {showAddMatch && (
                    <div className="modal-overlay" style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="modal-content animate-fade-in" style={{ padding: '24px', backgroundColor: 'white', borderRadius: '24px', width: '90%', maxWidth: '380px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>Create Custom Match</h3>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Team 1</label>
                            <select value={customT1} onChange={(e) => setCustomT1(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '16px', fontWeight: '800', fontSize: '15px' }}>
                                <option value="">Select Team 1</option>
                                {tournament.teams.map(t => (
                                    <option key={t.teamId} value={t.teamId}>{t.name}</option>
                                ))}
                            </select>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Team 2</label>
                            <select value={customT2} onChange={(e) => setCustomT2(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '16px', fontWeight: '800', fontSize: '15px' }}>
                                <option value="">Select Team 2</option>
                                {tournament.teams.map(t => (
                                    <option key={t.teamId} value={t.teamId}>{t.name}</option>
                                ))}
                            </select>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Overs</label>
                            <input type="number" placeholder="Match Overs (Leave blank to use default)" value={customOvers} onChange={(e) => { const val = e.target.value; if (val === '') { setCustomOvers(''); return; }; setCustomOvers(sanitizeNumber(val, 1, 100).toString()); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '20px', fontWeight: '800', fontSize: '15px' }} />
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => setShowAddMatch(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontWeight: '800', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleAddCustomMatch} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#e94560', color: 'white', fontWeight: '900', cursor: 'pointer' }}>Create</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODALS RENDERED IN MAIN RETURN BODY TO GUARANTEE FULL BACKDROP COVERAGE */}
                {playersTeam && (
                    <div className="modal-overlay" style={{ zIndex: 1001, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="modal-content animate-fade-in" style={{ padding: '24px', backgroundColor: 'white', borderRadius: '24px', width: '90%', maxWidth: '380px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>{playersTeam.name} Players</h3>
                            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {playersTeam.players.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px', fontSize: '14px', fontWeight: '600' }}>No players added yet.</div>
                                ) : (
                                    playersTeam.players.map((p, pIdx) => (
                                        <div key={pIdx} style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: '800', fontSize: '14px', color: '#1e1b4b' }}>{p.name}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>{p.role || 'Batsman'}</div>
                                            </div>
                                            <button onClick={async () => {
                                                const updTeams = tournament.teams.map(t => t.teamId === playersTeam.teamId ? { ...t, players: t.players.filter((_, idx) => idx !== pIdx) } : t);
                                                const updTrn = { ...tournament, teams: updTeams };
                                                setTournament(updTrn);
                                                setPlayersTeam(updTrn.teams.find(t => t.teamId === playersTeam.teamId));
                                                const stored = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
                                                const i = stored.findIndex(t => t.tournamentId === tournament.tournamentId);
                                                if (i !== -1) { stored[i] = updTrn; localStorage.setItem('cricscore_tournaments', JSON.stringify(stored)); }
                                                if (globalState.loginType === 'google' || globalState.loginType === 'shareable' || globalState.loginType === 'code') { try { const { doc, setDoc } = await import('firebase/firestore'); await setDoc(doc(db, 'tournaments', tournament.tournamentId), updTrn); } catch (e) { } }
                                            }} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: '900', cursor: 'pointer' }}>X</button>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                <input type="text" placeholder="Player Name" value={newPlayerName} onChange={(e) => setNewPlayerName(sanitizeName(e.target.value).toUpperCase())} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '8px', fontWeight: '800', outline: 'none', fontSize: '15px' }} />
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <select value={newPlayerRole} onChange={(e) => { setNewPlayerRole(e.target.value); setSubRole(''); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', fontWeight: '800', fontSize: '14px' }}>
                                        <option>Batsman</option><option>Bowler</option><option>All-Rounder</option><option>Wicket Keeper</option>
                                    </select>
                                    {(newPlayerRole === 'Batsman' || newPlayerRole === 'Bowler') && (
                                        <select value={subRole} onChange={(e) => setSubRole(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', fontWeight: '800', fontSize: '14px' }}>
                                            <option value="">Style</option>
                                            {newPlayerRole === 'Batsman' && (<><option value="RH">Right Hand</option><option value="LH">Left Hand</option></>)}
                                            {newPlayerRole === 'Bowler' && (<><option value="Pacer">Pacer</option><option value="Spinner">Spinner</option></>)}
                                        </select>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setPlayersTeam(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontWeight: '800', cursor: 'pointer' }}>Close</button>
                                    <button onClick={handleAddPlayer} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#e94560', color: 'white', fontWeight: '900', cursor: 'pointer' }}>Add Player</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {editingTeam && (
                    <div className="modal-overlay" style={{ zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="modal-content animate-fade-in" style={{ padding: '24px', backgroundColor: 'white', borderRadius: '24px', width: '90%', maxWidth: '360px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '900', color: '#1e1b4b' }}>Edit Team Name</h3>
                            <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(sanitizeName(e.target.value).toUpperCase())} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '16px', fontWeight: '800', fontSize: '16px', outline: 'none' }} />
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => setEditingTeam(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: 'white', fontWeight: '800', cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleUpdateTeam} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#e94560', color: 'white', fontWeight: '900', cursor: 'pointer' }}>Save</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TournamentDashboard;
