import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import NameInput from '../components/NameInput';
import { sanitizeName } from '../utils/sanitize';
import { useMatch } from '../context/MatchContext';
import { ChevronRight, ChevronLeft, Plus, Users, Trophy, Target, Shuffle } from 'lucide-react';
import { generateKnockoutFixtures, generateRoundRobinFixtures, generateGroupFixtures, updatePointsTable } from '../utils/tournamentLogic';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

const CreateTournament = () => {
    const navigate = useNavigate();
    const { state } = useMatch();
    const [step, setStep] = useState(1);

    // Step 1 Data
    const [name, setName] = useState('');
    const [overs, setOvers] = useState(5);
    const [format, setFormat] = useState('knockout'); // knockout, roundrobin, group_knockout

    // Step 2 Data
    const [teams, setTeams] = useState([
        { id: 1, name: '', players: [{ name: '' }, { name: '' }], expanded: false },
        { id: 2, name: '', players: [{ name: '' }, { name: '' }], expanded: false },
        { id: 3, name: '', players: [{ name: '' }, { name: '' }], expanded: false },
        { id: 4, name: '', players: [{ name: '' }, { name: '' }], expanded: false }
    ]);
    const [numGroups, setNumGroups] = useState(2);
    const [groups, setGroups] = useState([]); // Array of { groupId, name, teams: [...] }

    const getMinTeams = () => {
        if (format === 'knockout') return 4;
        if (format === 'roundrobin') return 3;
        if (format === 'group_knockout') return 6;
        return 4;
    };

    const validateStep1 = () => name.trim().length > 0;

    const validateStep2 = () => {
        const validTeams = teams.filter(t => t.name.trim().length > 0);
        
        const names = validTeams.map(t => t.name.trim().toUpperCase());
        const hasDuplicates = names.some((n, idx) => names.indexOf(n) !== idx);
        if (hasDuplicates) {
            alert("Error: Duplicate team names are not allowed.");
            return false;
        }

        const minT = getMinTeams();
        if (validTeams.length < minT) {
            alert(`Warning: At least ${minT} teams are required to proceed format ${format.toUpperCase()}.`);
            return false;
        }
        return true;
    };

    const handleNext = () => {
        if (step === 1) {
            if (validateStep1()) {
                const minT = getMinTeams();
                if (teams.length < minT) {
                    const newTeams = [...teams];
                    while (newTeams.length < minT) {
                        newTeams.push({ id: Date.now() + Math.random(), name: '', players: [{ name: '' }, { name: '' }], expanded: false });
                    }
                    setTeams(newTeams);
                }
                setStep(2);
            }
        } else if (step === 2) {
            const val = validateStep2();
            if (val !== true) {
                alert(val);
                return;
            }
            
            // Distribute into groups if group_knockout
            const validActiveTeams = teams.filter(t => t.name.trim().length > 0 && t.players.filter(p => p.name.trim().length > 0).length >= 2);
            
            if (format === 'group_knockout') {
                const shuffled = [...validActiveTeams].sort(() => 0.5 - Math.random());
                const generatedGroups = Array.from({ length: numGroups }, (_, i) => ({
                    groupId: `g${i+1}`,
                    name: `Group ${String.fromCharCode(65 + i)}`,
                    teams: []
                }));
                
                shuffled.forEach((t, i) => {
                    const mappedTeam = {
                        teamId: `t_${Date.now()}_${i}`,
                        name: t.name,
                        players: t.players.filter(p => p.name.trim().length > 0)
                    };
                    generatedGroups[i % numGroups].teams.push(mappedTeam);
                });
                
                setGroups(generatedGroups);
            }

            setStep(3);
        }
    };

    const handleCreate = async () => {
        const validTeams = teams.filter(t => t.name.trim().length > 0);
        
        const finalTeams = [];
        let fixtures = [];

        if (format !== 'group_knockout') {
            validTeams.forEach((t, i) => {
                finalTeams.push({
                    teamId: `t_${Date.now()}_${i}`,
                    name: t.name,
                    players: t.players.filter(p => p.name.trim().length > 0)
                });
            });

            if (format === 'knockout') {
                fixtures = generateKnockoutFixtures(finalTeams);
            } else if (format === 'roundrobin') {
                fixtures = generateRoundRobinFixtures(finalTeams);
            }
        } else {
            groups.forEach(g => {
                g.teams.forEach(t => {
                    finalTeams.push({...t, groupId: g.groupId});
                });
            });
            fixtures = generateGroupFixtures(groups);
        }

        const initialPointsTable = (format === 'roundrobin' || format === 'group_knockout') 
            ? updatePointsTable(finalTeams, fixtures, format) 
            : [];

        const tournament = {
            tournamentId: `trn_${Date.now()}`,
            shareCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            name,
            organizer: state.userName || 'Shakti',
            userCode: state.userCode,
            createdAt: Date.now(),
            format,
            status: "upcoming",
            overs,
            teams: finalTeams,
            groups: format === 'group_knockout' ? groups.map(g => ({ groupId: g.groupId, name: g.name, teamIds: g.teams.map(t => t.teamId) })) : [],
            matches: fixtures,
            pointsTable: initialPointsTable,
            knockoutBracket: { quarterfinals: [], semifinals: [], final: null }
        };

        // Save to localStorage
        const existing = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        existing.push(tournament);
        localStorage.setItem('cricscore_tournaments', JSON.stringify(existing));

        // Sync to Firestore
        if (state.loginType === 'google' || state.loginType === 'shareable') {
            try {
                const docRef = doc(db, 'tournaments', tournament.tournamentId);
                await setDoc(docRef, tournament);
            } catch (e) {
                console.error("Failed to backup tournament", e);
            }
        }

        navigate(`/tournament/${tournament.tournamentId}`, { replace: true });
    };

    const addTeam = () => {
        setTeams([...teams, { id: Date.now(), name: '', players: [{ name: '' }, { name: '' }], expanded: true }]);
    };

    const removeTeam = (id) => {
        setTeams(teams.filter(t => t.id !== id));
    };

    const updateTeamName = (id, newName) => {
        setTeams(teams.map(t => t.id === id ? { ...t, name: newName.toUpperCase() } : t));
    };

    const toggleTeamExp = (id) => {
        setTeams(teams.map(t => t.id === id ? { ...t, expanded: !t.expanded } : t));
    };

    const addPlayer = (teamId) => {
        setTeams(teams.map(t => {
            if (t.id === teamId) {
                if (t.players.length >= 15) return t;
                return { ...t, players: [...t.players, { name: '' }] };
            }
            return t;
        }));
    };

    const updatePlayerName = (teamId, pIdx, newName) => {
        setTeams(teams.map(t => {
            if (t.id === teamId) {
                const newP = [...t.players];
                newP[pIdx].name = newName.toUpperCase();
                return { ...t, players: newP };
            }
            return t;
        }));
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
            <Header showLogout={false} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ padding: '24px 20px', backgroundColor: '#1e1b4b', color: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div onClick={() => step > 1 ? setStep(step - 1) : navigate('/tournaments')} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <ChevronLeft size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Tournament Setup</div>
                            <div style={{ fontSize: '20px', fontWeight: '800' }}>Step {step} of 3</div>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px' }}>
                    {step === 1 && (
                        <div className="animate-fade-in">
                            <div className="card" style={{ padding: '20px', borderRadius: '24px', backgroundColor: 'white', border: 'none', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Tournament Name</label>
                                <input 
                                    type="text" 
                                    value={name} 
                                    onChange={(e) => setName(sanitizeName(e.target.value).toUpperCase())} 
                                    placeholder="e.g. GULLY PREMIER LEAGUE" 
                                    maxLength={100}
                                    style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '2px solid #e2e8f0', fontSize: '16px', fontWeight: '700', color: '#1e1b4b', marginBottom: '24px', backgroundColor: '#f8fafc' }}
                                />

                            </div>

                            <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#1e1b4b', marginBottom: '16px' }}>Select Format</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div onClick={() => setFormat('knockout')} style={{ padding: '20px', borderRadius: '24px', backgroundColor: 'white', border: format === 'knockout' ? '3px solid #10b981' : '3px solid transparent', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', cursor: 'pointer', transition: '0.2s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}><Trophy size={24} /></div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e1b4b' }}>Knockout</h4>
                                        </div>
                                    </div>
                                    <ul style={{ margin: '12px 0 0 0', paddingLeft: '24px', color: '#64748b', fontSize: '14px', fontWeight: '600' }}>
                                        <li>Direct elimination, loser goes home</li>
                                        <li>Works with any number of teams (min 2)</li>
                                    </ul>
                                </div>

                                <div onClick={() => setFormat('roundrobin')} style={{ padding: '20px', borderRadius: '24px', backgroundColor: 'white', border: format === 'roundrobin' ? '3px solid #10b981' : '3px solid transparent', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', cursor: 'pointer', transition: '0.2s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4338ca' }}><Shuffle size={24} /></div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e1b4b' }}>Round Robin</h4>
                                        </div>
                                    </div>
                                    <ul style={{ margin: '12px 0 0 0', paddingLeft: '24px', color: '#64748b', fontSize: '14px', fontWeight: '600' }}>
                                        <li>Every team plays every other team</li>
                                        <li>Works with any number of teams (min 2)</li>
                                    </ul>
                                </div>

                                <div onClick={() => setFormat('group_knockout')} style={{ padding: '20px', borderRadius: '24px', backgroundColor: 'white', border: format === 'group_knockout' ? '3px solid #10b981' : '3px solid transparent', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', cursor: 'pointer', transition: '0.2s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                                        <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}><Target size={24} /></div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e1b4b' }}>Group Stage + Knockout</h4>
                                        </div>
                                    </div>
                                    <ul style={{ margin: '12px 0 0 0', paddingLeft: '24px', color: '#64748b', fontSize: '14px', fontWeight: '600' }}>
                                        <li>Groups first, then elimination rounds</li>
                                        <li>Works with any number of teams (min 4)</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-fade-in">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', margin: 0 }}>Add Teams</h3>
                                <span style={{ fontSize: '12px', fontWeight: '800', backgroundColor: '#e2e8f0', color: '#475569', padding: '4px 12px', borderRadius: '20px' }}>
                                    {teams.filter(t => t.name.trim() !== '').length} Added
                                </span>
                            </div>
                            
                            {format === 'group_knockout' && (
                                <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Number of Groups</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[2, 3, 4].map(n => (
                                            <button key={n} onClick={() => setNumGroups(n)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: numGroups === n ? '2px solid #4338ca' : '2px solid #e2e8f0', backgroundColor: numGroups === n ? '#eef2ff' : '#f8fafc', color: numGroups === n ? '#4338ca' : '#64748b', fontWeight: '800', cursor: 'pointer' }}>{n} Groups</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {teams.map((t, idx) => (
                                    <div key={t.id} style={{ backgroundColor: 'white', borderRadius: '20px', padding: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: '#94a3b8' }}>{idx + 1}</div>
                                            <input type="text" value={t.name} onChange={(e) => updateTeamName(t.id, sanitizeName(e.target.value).toUpperCase())} placeholder={`Team ${idx+1} Name`} style={{ flex: 1, border: 'none', borderBottom: '2px solid #e2e8f0', padding: '8px 0', fontSize: '16px', fontWeight: '800', color: '#1e1b4b', outline: 'none' }} />
                                            {teams.length > getMinTeams() && (
                                                <button onClick={() => removeTeam(t.id)} style={{ padding: '8px', background: 'none', border: 'none', color: '#ef4444', fontWeight: '800', cursor: 'pointer' }}>X</button>
                                            )}
                                        </div>

                                        <div style={{ marginTop: '12px' }}>
                                            <button onClick={() => toggleTeamExp(t.id)} style={{ width: '100%', padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontWeight: '700', cursor: 'pointer' }}>
                                                <span>{t.players.filter(p=>p.name).length} Players Added</span>
                                                <ChevronRight size={18} style={{ transform: t.expanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                                            </button>

                                            {t.expanded && (
                                                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {t.players.map((p, pIdx) => (
                                                        <NameInput 
                                                            key={pIdx} 
                                                            value={p.name} 
                                                            onChange={(val) => updatePlayerName(t.id, pIdx, val)} 
                                                            placeholder={`Player ${pIdx + 1}`} 
                                                            style={{ input: { backgroundColor: '#f1f5f9', border: 'none', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: '700' } }}
                                                        />
                                                    ))}
                                                    {t.players.length < 15 && (
                                                        <button onClick={() => addPlayer(t.id)} style={{ padding: '12px', backgroundColor: 'transparent', border: '2px dashed #cbd5e1', borderRadius: '12px', color: '#64748b', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                            <Plus size={16} /> Add Player
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <button onClick={addTeam} style={{ padding: '16px', backgroundColor: '#eef2ff', border: '2px dashed #818cf8', borderRadius: '20px', color: '#4338ca', fontSize: '16px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <Plus size={20} /> Add Another Team
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-fade-in">
                            <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b', marginBottom: '20px' }}>Preview & Confirm</h3>
                            
                            <div className="card" style={{ backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', marginBottom: '24px', border: 'none' }}>
                                <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Tournament Details</div>
                                <div style={{ fontSize: '24px', fontWeight: '900', color: '#1e1b4b', marginBottom: '16px' }}>{name}</div>
                                
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '12px', borderRadius: '12px' }}>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', marginBottom: '4px' }}>Format</div>
                                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e1b4b' }}>{format.replace('_', ' ').toUpperCase()}</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px' }}>Teams Overview</div>
                                
                                {format === 'group_knockout' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {groups.map((g, i) => (
                                            <div key={i} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                                                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '800', color: '#4338ca' }}>{g.name}</h4>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {g.teams.map((t, j) => (
                                                        <span key={j} style={{ backgroundColor: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#475569' }}>{t.name}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {teams.filter(t => t.name.trim() !== '').map((t, i) => (
                                            <span key={i} style={{ backgroundColor: '#f1f5f9', padding: '8px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: '700', color: '#475569' }}>{t.name}</span>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>
            </div>

            <div style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #f1f5f9' }}>
                <button 
                    onClick={step < 3 ? handleNext : handleCreate}
                    disabled={step === 1 && !validateStep1()}
                    style={{
                        width: '100%',
                        padding: '18px',
                        backgroundColor: (step === 1 && !validateStep1()) ? '#94a3b8' : '#e94560',
                        color: 'white',
                        border: 'none',
                        borderRadius: '20px',
                        fontSize: '18px',
                        fontWeight: '900',
                        cursor: (step === 1 && !validateStep1()) ? 'not-allowed' : 'pointer',
                        boxShadow: (step === 1 && !validateStep1()) ? 'none' : '0 8px 25px rgba(233, 69, 96, 0.3)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    {step < 3 ? 'Continue' : 'Create Tournament'}
                    {step < 3 && <ChevronRight size={20} />}
                </button>
            </div>
        </div>
    );
};

export default CreateTournament;
