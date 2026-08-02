import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { Bell, Settings, LogOut, Cloud, RefreshCcw, CheckCircle } from 'lucide-react';
import { syncToFirestore } from '../context/MatchContext';
import { auth } from '../firebase';

const Header = ({ title = "CricScorer Pro", showLogout = false }) => {
    const { state, dispatch } = useMatch();
    const navigate = useNavigate();
    const [showStatusText, setShowStatusText] = React.useState(false);

    const handleManualSync = async (e) => {
        e.stopPropagation();
        if (state.syncStatus === 'syncing' || !state.userCode) return;
        
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' });
        try {
            // 1. Sync current match state
            const { syncToFirestore: sync } = await import('../context/MatchContext');
            await sync(state);
            
            // 2. CRITICAL FIX: Also sync ALL local matches to Firestore
            // Previously only the current match was synced, leaving other completed matches stranded
            const { syncAllLocalMatchesToCloud } = await import('../utils/dataFetcher');
            const result = await syncAllLocalMatchesToCloud();
            console.log(`[ManualSync] Synced ${result.synced} matches, ${result.errors} errors`);
            
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'synced' });
            setShowStatusText(true);
            setTimeout(() => setShowStatusText(false), 2000);
        } catch (e) {
            console.error(e);
            dispatch({ type: 'SET_SYNC_STATUS', payload: 'pending' });
        }
    };

    const getSyncIcon = () => {
        if (state.syncStatus === 'syncing') return <RefreshCcw size={14} className="animate-spin" />;
        if (state.syncStatus === 'synced') return <CheckCircle size={14} />;
        return <Cloud size={14} />;
    };

    const getSyncText = () => {
        if (state.syncStatus === 'syncing') return 'Syncing...';
        if (state.syncStatus === 'synced') return 'Synced';
        return 'Sync Pending';
    };

    const getSyncColor = () => {
        if (state.syncStatus === 'syncing') return '#6366f1';
        if (state.syncStatus === 'synced') return '#10b981';
        return '#f59e0b';
    };

    const [isLive, setIsLive] = React.useState(false);

    React.useEffect(() => {
        const checkLive = async () => {
            if (state.loginType === 'code' && state.userCode) {
                try {
                    const { db } = await import('../firebase');
                    const { doc, getDoc } = await import('firebase/firestore');
                    const docSnap = await getDoc(doc(db, 'shareLogins', state.userCode));
                    if (docSnap.exists()) {
                        setIsLive(docSnap.data().isLive === true);
                    }
                } catch (e) {
                    console.error("Live check failed", e);
                }
            }
        };
        checkLive();
    }, [state.loginType, state.userCode]);

    return (
        <div className="header" style={{ justifyContent: 'space-between', padding: '0 16px' }}>
            <div className="text-gradient" style={{ fontWeight: '800', fontSize: '20px', letterSpacing: '-0.5px' }}>{title}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center' }}>
        {(state.loginType === 'shareable' || state.loginType === 'code') && state.userCode && (
            <div style={{
                backgroundColor: 'rgba(79, 70, 229, 0.08)',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '800',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid rgba(79, 70, 229, 0.15)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', opacity: 0.7, marginRight: '2px' }}>CODE:</span>
                    <span style={{ fontFamily: 'monospace', letterSpacing: '0.5px', color: '#1e1b4b' }}>{state.userCode}</span>
                </div>

                <div style={{ width: '1.5px', height: '14px', backgroundColor: 'rgba(79, 70, 229, 0.2)', flexShrink: 0 }} />


                        {showStatusText && <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '800' }}>Synced!</span>}
                        <button 
                            onClick={handleManualSync}
                            title={getSyncText()}
                            disabled={state.syncStatus === 'syncing'}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: getSyncColor(),
                                transform: 'scale(1.1)',
                                transition: 'transform 0.2s',
                                outline: 'none',
                                flexShrink: 0
                             }}
                             className="sync-icon-btn"
                        >
                            {getSyncIcon()}
                        </button>
                        <style>{`
                            .sync-icon-btn:active { transform: scale(0.9) !important; }
                        `}</style>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Sync status moved inside code pill above */}

                {showLogout && (
                    <button
                        style={{
                            width: '40px',
                            height: '40px',
                            background: '#f1f5f9',
                            color: '#ef4444',
                            padding: 0,
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: 'none'
                        }}
                        onClick={async () => {
                            try {
                                if (auth.currentUser) await auth.signOut();
                            } catch (e) { console.error("SignOut err", e); }
                            dispatch({ type: 'LOGOUT' });
                            navigate('/');
                        }}
                    >
                        <LogOut size={18} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default Header;
