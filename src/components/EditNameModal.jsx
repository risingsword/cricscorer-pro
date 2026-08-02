import React from 'react';
import { sanitizeName } from '../utils/sanitize';

const EditNameModal = ({ info, onClose, onSave, onChange }) => {
    if (!info) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content animate-fade-in" style={{ padding: '24px', maxWidth: '340px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>Edit Name ✍️</h3>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>
                    Changing name will update it everywhere. If the new name already exists, data will be merged.
                </p>
                
                <input 
                    autoFocus
                    value={info.newName}
                    onChange={(e) => onChange(sanitizeName(e.target.value).toUpperCase())}
                    maxLength={50}
                    onKeyDown={(e) => e.key === 'Enter' && onSave()}
                    placeholder="Enter player/team name"
                    style={{
                        width: '100%',
                        height: '50px',
                        padding: '0 16px',
                        borderRadius: '12px',
                        border: '2px solid #e2e8f0',
                        fontSize: '15px',
                        fontWeight: '700',
                        marginBottom: '20px',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        color: '#1e1b4b'
                    }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={onClose}
                        style={{ 
                            flex: 1, height: '48px', borderRadius: '12px', border: '1px solid #e2e8f0', 
                            backgroundColor: 'white', color: '#64748b', fontWeight: '800', cursor: 'pointer' 
                        }}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onSave}
                        disabled={!info.newName.trim() || info.newName === info.oldName}
                        style={{ 
                            flex: 1, height: '48px', borderRadius: '12px', border: 'none', 
                            backgroundColor: '#4338ca', color: 'white', fontWeight: '900', cursor: 'pointer',
                            opacity: (!info.newName.trim() || info.newName === info.oldName) ? 0.6 : 1
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditNameModal;
