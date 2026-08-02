import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const CURRENT_VERSION = "1.0.9";

// Simple semver comparison: returns 1 if v1 > v2
const compareVersions = (v1, v2) => {
    const cleanV1 = v1.replace(/^v/i, '');
    const cleanV2 = v2.replace(/^v/i, '');
    const p1 = cleanV1.split('.').map(p => parseInt(p, 10) || 0);
    const p2 = cleanV2.split('.').map(p => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
};

const UpdateChecker = () => {
    const [showDialog, setShowDialog] = useState(false);
    const [updateData, setUpdateData] = useState({
        version: '',
        apk_url: '',
        message: '',
        force: false
    });

    useEffect(() => {
        const checkUpdate = async () => {
            // Only check once per absolute app session to avoid jarring UX
            if (sessionStorage.getItem('cricscorer_update_checked')) return;
            sessionStorage.setItem('cricscorer_update_checked', 'true');

            try {
                const docRef = doc(db, 'app_config', 'status');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.version && compareVersions(data.version, CURRENT_VERSION) > 0) {
                        setUpdateData({
                            version: data.version,
                            apk_url: data.apk_url || '',
                            message: data.message || 'A new update is available. Please update to continue.',
                            force: !!data.force
                        });
                        setShowDialog(true);
                    }
                }
            } catch (error) {
                // Silently ignore strictly as requested so the app doesn't crash on failed polls
                console.warn('Update check silently failed:', error);
            }
        };

        checkUpdate();
    }, []);

    if (!showDialog) return null;

    const handleUpdate = () => {
        if (updateData.apk_url) {
            window.open(updateData.apk_url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleDismiss = () => {
        if (!updateData.force) {
            setShowDialog(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(30, 27, 75, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999, // Ensure absolute top layer
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
        }}>
            <div className="animate-fade-in" style={{
                backgroundColor: '#1a1a2e',
                color: '#ffffff',
                padding: '32px 24px',
                borderRadius: '24px',
                maxWidth: '400px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '16px', letterSpacing: '-0.5px' }}>
                    Update Available
                </h2>
                <p style={{
                    fontSize: '15px',
                    color: 'rgba(255,255,255,0.7)',
                    lineHeight: 1.5,
                    marginBottom: '32px',
                    fontWeight: '500'
                }}>
                    {updateData.message}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        onClick={handleUpdate}
                        style={{
                            width: '100%',
                            padding: '16px',
                            backgroundColor: '#e94560',
                            color: 'white',
                            border: 'none',
                            borderRadius: '16px',
                            fontSize: '16px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#d6344d'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#e94560'}
                    >
                        Update Now
                    </button>
                    {!updateData.force && (
                        <button
                            onClick={handleDismiss}
                            style={{
                                width: '100%',
                                padding: '16px',
                                backgroundColor: 'transparent',
                                color: 'rgba(255,255,255,0.6)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '16px',
                                fontSize: '15px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.target.style.color = '#fff'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = 'rgba(255,255,255,0.6)'; }}
                        >
                            Later
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdateChecker;
