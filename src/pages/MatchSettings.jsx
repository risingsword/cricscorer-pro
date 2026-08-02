import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft } from 'lucide-react';

const MatchSettings = () => {
    const navigate = useNavigate();
    const { state, dispatch } = useMatch();
    const [settings, setSettings] = useState(state.settings);
    const [playersPerTeam, setPlayersPerTeam] = useState(state.playersPerTeam);
    const [memeMode, setMemeMode] = useState(localStorage.getItem("cricscorer_meme_mode") === "true");

    const handleUnblockAll = () => {
        if (window.confirm('This will restore all hidden players AND any matches you might have deleted by mistake on this device. Continue?')) {
            localStorage.removeItem('cricscorer_blocked_names');
            localStorage.removeItem('deleted_matches');
            sessionStorage.removeItem('cricscorer_players_list');
            sessionStorage.removeItem('local_deleted_records');
            alert('All hidden players and deleted matches have been restored! Please go to History and sync again.');
        }
    };

    const handleHardReset = async () => {
        if (window.confirm('WARNING: This will wipe ALL local data on this device and re-sync everything from the Cloud. This is the ultimate fix for sync differences. Continue?')) {
            const prefix = `cricscorer_`;
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(prefix)) localStorage.removeItem(key);
            });
            localStorage.removeItem('cricscore_tournaments');
            localStorage.removeItem('deleted_matches');
            localStorage.removeItem('cricscorer_matches'); // Legacy key — source of extra ghost matches
            
            try {
                const { openDB } = await import('idb');
                const idb = await openDB('CricScorerDB', 1);
                const tx = idb.transaction('matches', 'readwrite');
                await tx.store.clear();
                await tx.done;
            } catch(e) {}

            alert('Local data wiped successfully. The app will now reload and fetch fresh data from Cloud.');
            window.location.reload();
        }
    };

    const handleSave = () => {
        dispatch({ type: 'UPDATE_STATE', payload: { settings, playersPerTeam } });
        localStorage.setItem("cricscorer_meme_mode", memeMode.toString());
        navigate(-1);
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Simplified toggle component
    const Toggle = ({ label, value, onChange }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e1b4b' }}>{label}</span>
            <div
                onClick={() => onChange(!value)}
                style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: '11px',
                    backgroundColor: value ? '#10b981' : '#e2e8f0',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: '0.3s'
                }}
            >
                <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: value ? '20px' : '2px',
                    transition: '0.3s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }} />
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <div className="header" style={{ height: '56px', padding: '0 16px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
                <ChevronLeft onClick={() => navigate(-1)} style={{ marginRight: '12px', cursor: 'pointer', color: '#1e1b4b' }} />
                <span style={{ fontWeight: '800', fontSize: '16px', color: '#1e1b4b' }}>Match Settings</span>
            </div>

            <div className="container animate-fade-in" style={{ padding: '16px', paddingBottom: '24px' }}>
                <div className="card" style={{ padding: '16px', marginBottom: '12px', borderRadius: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>General</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e1b4b' }}>Players per team?</span>
                        <input
                            type="number"
                            min="3"
                            max="11"
                            value={playersPerTeam}
                            onChange={(e) => {
                                let val = parseInt(e.target.value);
                                if (isNaN(val)) return setPlayersPerTeam('');
                                if (val > 11) val = 11;
                                setPlayersPerTeam(val);
                            }}
                            onBlur={() => {
                                if (playersPerTeam < 3 || !playersPerTeam) setPlayersPerTeam(3);
                            }}
                            style={{ width: '64px', height: '40px', textAlign: 'center', borderRadius: '10px', fontSize: '15px', border: '1.5px solid #f1f5f9' }}
                        />
                    </div>
                </div>

                <div className="card" style={{ padding: '16px', marginBottom: '12px', borderRadius: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>No Ball</h3>
                    <Toggle label="Show No Ball" value={settings.showNoBall} onChange={(v) => updateSetting('showNoBall', v)} />
                    <Toggle label="Enable No Ball Run" value={settings.noBallEnabled} onChange={(v) => updateSetting('noBallEnabled', v)} />
                    {settings.noBallEnabled && (
                        <div style={{ paddingLeft: '12px', borderLeft: '2px solid #e2e8f0', marginTop: '12px' }}>
                            <Toggle label="Re-ball?" value={settings.noBallReball} onChange={(v) => updateSetting('noBallReball', v)} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                                <span style={{ fontSize: '14px', fontWeight: '600', color: '#4b5563' }}>Runs on No Ball?</span>
                                <input type="number" value={settings.noBallRuns} onChange={(e) => updateSetting('noBallRuns', parseInt(e.target.value))} style={{ width: '56px', height: '36px', textAlign: 'center', borderRadius: '8px', fontSize: '14px', border: '1.5px solid #f1f5f9' }} />
                            </div>
                            <Toggle label="Free Hit on No Ball?" value={settings.freehitEnabled} onChange={(v) => updateSetting('freehitEnabled', v)} />
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: '16px', marginBottom: '12px', borderRadius: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>Wide Ball</h3>
                    <Toggle label="Show Wide Ball" value={settings.showWideBall} onChange={(v) => updateSetting('showWideBall', v)} />
                    <Toggle label="Enable Wide Run" value={settings.wideBallEnabled} onChange={(v) => updateSetting('wideBallEnabled', v)} />
                    {settings.wideBallEnabled && (
                        <div style={{ paddingLeft: '12px', borderLeft: '2px solid #e2e8f0', marginTop: '12px' }}>
                            <Toggle label="Re-ball?" value={settings.wideBallReball} onChange={(v) => updateSetting('wideBallReball', v)} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                                <span style={{ fontSize: '14px', fontWeight: '600', color: '#4b5563' }}>Runs on Wide?</span>
                                <input type="number" value={settings.wideBallRuns} onChange={(e) => updateSetting('wideBallRuns', parseInt(e.target.value))} style={{ width: '56px', height: '36px', textAlign: 'center', borderRadius: '8px', fontSize: '14px', border: '1.5px solid #f1f5f9' }} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: '16px', marginBottom: '16px', borderRadius: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>Extras</h3>
                    <Toggle label="Enable Byes?" value={settings.byesEnabled} onChange={(v) => updateSetting('byesEnabled', v)} />
                    <Toggle label="Enable Leg Byes?" value={settings.legByesEnabled} onChange={(v) => updateSetting('legByesEnabled', v)} />
                </div>

                <div className="card" style={{ padding: '16px', marginBottom: '16px', borderRadius: '16px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>Audio</h3>
                    <Toggle label="🎵 Meme Mode" value={memeMode} onChange={(v) => { setMemeMode(v); localStorage.setItem("cricscorer_meme_mode", v.toString()); }} />
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '-4px', opacity: 0.8 }}>Funny sounds during live scoring</p>
                </div>


                <button
                    className="primary"
                    onClick={handleSave}
                    style={{
                        width: '100%',
                        height: '52px',
                        borderRadius: '16px',
                        fontSize: '15px',
                        fontWeight: '800',
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                        boxShadow: '0 8px 25px rgba(30, 27, 75, 0.2)'
                    }}>
                    Save Settings
                </button>
            </div>
        </div>
    );
};

export default MatchSettings;
