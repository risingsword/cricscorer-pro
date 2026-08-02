import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { sanitizeName, sanitizeInput } from '../utils/sanitize';

const FeedbackModal = ({ isOpen, onClose }) => {
    const [type, setType] = useState('Bug Report'); // or 'Feature Request'
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const activeLogin = JSON.parse(localStorage.getItem('gullycric_active_login') || '{}');
        const defaultName = activeLogin.userName || activeLogin.ownerName || '';
        setName(defaultName);
    }, [isOpen]);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        const activeLogin = JSON.parse(localStorage.getItem('gullycric_active_login') || '{}');
        const userEmail = activeLogin.userEmail || 'guest@cricscorer.app';

        const payload = {
            name: name || 'Guest User',
            email: userEmail,
            subject: `${type} - CricScorer Pro`,
            message: message,
            _replyto: userEmail,
            appVersion: "1.0.2",
            loginType: activeLogin.type || 'guest',
            timestamp: new Date().toISOString()
        };

        try {
            const response = await fetch('https://formspree.io/f/mzdjqlnw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                alert('Feedback submitted! Thank you 🙏');
                setMessage('');
                onClose();
            } else {
                alert('Submission failed, please try again');
            }
        } catch (error) {
            alert('Submission failed, please try again');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const placeholderText = type === 'Bug Report' 
        ? "What problem are you facing? When does it happen?" 
        : "What feature would you like to request?";

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex',
            alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="animate-slide-up" style={{
                background: 'white', borderRadius: '24px', padding: '24px',
                width: '90%', maxWidth: '400px', maxHeight: '85vh',
                overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                color: '#1e1b4b'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>Feedback 💬</h3>
                    <div onClick={onClose} style={{ padding: '4px', cursor: 'pointer' }}><X size={20} color="#64748b" /></div>
                </div>
                <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Report a bug or suggest a feature</p>

                {/* Type Selector */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <button 
                        onClick={() => setType('Bug Report')}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '14px', border: type === 'Bug Report' ? '2px solid #e94560' : '2px solid #e2e8f0',
                            backgroundColor: type === 'Bug Report' ? '#e94560' : 'white',
                            color: type === 'Bug Report' ? 'white' : '#64748b',
                            fontSize: '13px', fontWeight: '800', cursor: 'pointer', transition: '0.2s'
                        }}
                    >
                        🐛 Bug Report
                    </button>
                    <button 
                        onClick={() => setType('Feature Request')}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '14px', border: type === 'Feature Request' ? '2px solid #e94560' : '2px solid #e2e8f0',
                            backgroundColor: type === 'Feature Request' ? '#e94560' : 'white',
                            color: type === 'Feature Request' ? 'white' : '#64748b',
                            fontSize: '13px', fontWeight: '800', cursor: 'pointer', transition: '0.2s'
                        }}
                    >
                        ✨ Feature
                    </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Name</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(sanitizeName(e.target.value).toUpperCase())} 
                        placeholder="Your Name"
                        maxLength={50}
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: '700', boxSizing: 'border-box' }}
                    />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '800', color: '#64748b' }}>Message</label>
                    <textarea 
                        rows="5" 
                        value={message} 
                        onChange={(e) => setMessage(sanitizeInput(e.target.value))} 
                        placeholder={placeholderText}
                        maxLength={500}
                        style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: '600', resize: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontWeight: '600' }}>{message.length}/500</div>
                </div>

                <button 
                    onClick={handleSubmit}
                    disabled={isSubmitting || !message.trim()}
                    style={{
                        width: '100%', padding: '14px', borderRadius: '16px', backgroundColor: '#e94560', color: 'white',
                        border: 'none', fontSize: '15px', fontWeight: '800', cursor: 'pointer', opacity: (isSubmitting || !message.trim()) ? 0.6 : 1,
                        transition: '0.2s', boxShadow: '0 4px 12px rgba(233, 69, 96, 0.2)'
                    }}
                >
                    {isSubmitting ? 'Sending...' : 'Send Feedback 💬'}
                </button>

                <div onClick={onClose} style={{ textAlign: 'center', marginTop: '14px', fontSize: '13px', color: '#64748b', fontWeight: '700', cursor: 'pointer' }}>
                    Cancel
                </div>
            </div>
        </div>
    );
};

export default FeedbackModal;
