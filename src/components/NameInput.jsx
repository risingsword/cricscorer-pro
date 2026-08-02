import React, { useState, useEffect, useRef } from 'react';
import { getSavedNames, filterNames, saveNameToStorage, removeNameFromStorage, unblockNameFromStorage, getNameMatchCount } from '../utils/nameStorage';
import { useMatch } from '../context/MatchContext';
import { X } from 'lucide-react';

import { sanitizeName } from '../utils/sanitize';

const NameInput = ({ value, onChange, placeholder, className, style, disabled, onBlur }) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const containerRef = useRef(null);
    let blurTimeout = useRef(null);
    const { state } = useMatch();

    const getMatchSuggestions = (q) => {
        // Only suggest from current match if it is actually in progress!
        if (!state || !state.innings || (state.matchStatus !== 'live' && state.matchStatus !== 'innings_break')) return [];
        const names = new Set();
        try {
            state.innings.forEach(inn => {
                if (inn.batsmen) inn.batsmen.forEach(b => { if (b.name) names.add(b.name) });
                if (inn.bowlers) inn.bowlers.forEach(b => { if (b.name) names.add(b.name) });
                if (inn.timeline) inn.timeline.forEach(b => {
                    if (b.batsmanName) names.add(b.batsmanName);
                    if (b.bowlerName) names.add(b.bowlerName);
                    if (b.fielderName) names.add(b.fielderName);
                });
            });
        } catch (e) {
            console.error("Match suggestion error", e);
        }
        const arr = Array.from(names);
        if (!q || q.trim().length === 0) return arr.slice(0, 10);
        const lowerQ = q.trim().toLowerCase();
        return arr.filter(n => n.toLowerCase().includes(lowerQ));
    };

    useEffect(() => {
        return () => {
            if (blurTimeout.current) clearTimeout(blurTimeout.current);
        };
    }, []);

    const handleChange = (e) => {
        const val = sanitizeName(e.target.value).toUpperCase();
        if (onChange) onChange(val);

        const savedResults = filterNames(val);
        const matchResults = getMatchSuggestions(val);
        const combined = [...matchResults, ...savedResults.filter(n => !matchResults.map(m => m.toLowerCase()).includes(n.toLowerCase()))];
        
        setSuggestions(combined.slice(0, 30));
        setShowDropdown(combined.length > 0 && val.trim().length > 0);
    };

    const handleFocus = () => {
        if (!value || value.trim().length === 0) return;
        const savedResults = filterNames(value || '');
        const matchResults = getMatchSuggestions(value || '');
        const combined = [...matchResults, ...savedResults.filter(n => !matchResults.map(m => m.toLowerCase()).includes(n.toLowerCase()))];
        
        setSuggestions(combined.slice(0, 30));
        setShowDropdown(combined.length > 0);
    };

    const handleBlur = (e) => {
        // Save name if valid & un-dismiss from session if user typed it manually
        if (value && value.trim().length >= 2) {
            saveNameToStorage(value);
            unblockNameFromStorage(value); // if they typed a dismissed name, re-show it next time
        }
        blurTimeout.current = setTimeout(() => {
            setShowDropdown(false);
            if (onBlur) onBlur(e);
        }, 300);
    };

    const handleSelect = (name) => {
        if (onChange) onChange(name);
        unblockNameFromStorage(name); // remove from session dismiss if it was crossed
        setShowDropdown(false);
    };

    const handleDelete = (e, name) => {
        e.stopPropagation();
        // Don't allow dismissing names of players with 10+ matches — they're regulars
        if (getNameMatchCount(name) >= 10) return;
        removeNameFromStorage(name);
        setSuggestions(prev => {
            const updated = prev.filter(n => n.toLowerCase() !== name.toLowerCase());
            if (updated.length === 0) setShowDropdown(false);
            return updated;
        });
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', zIndex: showDropdown ? 99999 : 1, ...(style?.container || {}) }}>
            <input
                type="text"
                value={value || ''}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={className}
                style={{ width: '100%', ...(style?.input ? style.input : style || {}) }}
                disabled={disabled}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                maxLength={50}
                name={`name_input_${Math.random().toString(36).substring(2, 9)}`}
            />
            {showDropdown && suggestions.length > 0 && (
                <ul style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.45)',
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    color: '#1e1b4b',
                    border: '1px solid rgba(255,255,255,0.7)',
                    borderRadius: '12px',
                    margin: 0,
                    padding: '8px 0',
                    listStyle: 'none',
                    zIndex: 99999,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    boxShadow: '0 15px 35px rgba(30, 27, 75, 0.15), inset 0 1px 0 rgba(255,255,255,0.6)',
                    marginTop: '8px'
                }}>
                    {suggestions.map((name, index) => (
                        <li 
                            key={index} 
                            onClick={() => handleSelect(name)}
                            style={{
                                padding: '12px 16px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#1e1b4b',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(67, 56, 202, 0.12)'; e.currentTarget.style.color = '#4338ca'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#1e1b4b'; }}
                        >
                            <span>{name}</span>
                            {/* X only shown for players with < 10 matches */}
                            {getNameMatchCount(name) < 10 && (
                                <div 
                                    onClick={(e) => handleDelete(e, name)}
                                    style={{ padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <X size={14} color="#94a3b8" />
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default NameInput;
