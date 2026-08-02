import React, { useState, useRef, useCallback } from 'react';
import NameInput from './NameInput';

/* ─── iOS Ripple ─────────────────────────────────────────────────────────── */
function triggerRipple(containerRef, e, color = 'rgba(255,255,255,0.3)') {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ios-ripple-dot';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${x - size/2}px;top:${y - size/2}px;background:${color};`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 620);
}

const TapButton = ({ onClick, isSelected, disabled, style, children, rippleColor }) => {
    const ref = useRef(null);
    const handlePointerDown = useCallback((e) => {
        if (disabled) return;
        triggerRipple(ref, e, rippleColor || (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(30,27,75,0.12)'));
    }, [disabled, isSelected, rippleColor]);

    return (
        <div
            ref={ref}
            onClick={disabled ? undefined : onClick}
            onPointerDown={handlePointerDown}
            style={{
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '14px', fontFamily: 'inherit', fontWeight: '800', fontSize: '14px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                border: isSelected ? 'none' : '1.5px solid #f1f5f9',
                background: isSelected ? 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)' : '#ffffff',
                color: isSelected ? '#ffffff' : '#1e1b4b',
                boxShadow: isSelected ? '0 8px 20px rgba(30,27,75,0.22)' : '0 2px 8px rgba(0,0,0,0.03)',
                WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)',
                transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), background 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s ease, color 0.18s ease',
                userSelect: 'none', WebkitUserSelect: 'none',
                ...style,
            }}
        >
            <span style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'rgba(255,255,255,0)', pointerEvents: 'none' }} />
            <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────────────────
   Cricket rules — which dismissals CAN happen off a wide ball:
   • Stumped   ✅  keeper can stump off any wide
   • Run Out   ✅  batsmen can be run out off a wide (only if legByesEnabled,
                   because they must be attempting a run)
   • Hit Wicket ✅  batsman can dislodge stumps while attempting to play wide
   ─────────────────────────────────────────────────────────────────────── */

// Dismissals where we ALWAYS ask "was it a wide?"
const WIDE_ALWAYS  = ['stumped', 'hitwicket'];
// Dismissals where we ask ONLY IF leg byes are enabled in settings
const WIDE_IF_LEGBYE = ['runout'];

// After wide step — which dismissals need "who is out?" (step 2)?
// Striker is always assumed out for stumped/hitwicket; runout needs clarification.
const NEEDS_WHO_OUT = ['runout', 'retired'];

const WicketModal = ({
    show,
    currentStriker,
    currentNonStriker,
    currentBowler,
    isFreeHit,
    isLastWicket,
    settings,
    onWicket,
    onClose,
}) => {
    const [step, setStep]                   = useState(1);
    const [type, setType]                   = useState('');
    const [whoOut, setWhoOut]               = useState('');
    const [runsCompleted, setRunsCompleted] = useState(0);
    const [newBatsman, setNewBatsman]       = useState('');
    const [fielderName, setFielderName]     = useState('');
    const [wasWide, setWasWide]             = useState(null); // null = not answered yet

    if (!show) return null;

    const legByesOn = settings?.legByesEnabled !== false;

    // Build the list of wide-eligible dismissals dynamically
    const wideEligible = [
        ...WIDE_ALWAYS,
        ...(legByesOn ? WIDE_IF_LEGBYE : []),
    ];

    const dismissals = [
        { id: 'bowled',    label: '🏏 Bowled'      },
        { id: 'caught',    label: '🤲 Caught'       },
        { id: 'runout',    label: '🏃 Run Out'      },
        { id: 'stumped',   label: '🧤 Stumped'      },
        { id: 'hitwicket', label: '💥 Hit Wicket'  },
        { id: 'retired',   label: '🔄 Retired Hurt' },
    ];

    const resetAll = () => {
        setStep(1); setType(''); setWhoOut('');
        setRunsCompleted(0); setNewBatsman('');
        setFielderName(''); setWasWide(null);
    };

    // ── Step navigation logic ──────────────────────────────────────────────
    const handleDismissalPick = (id) => {
        setType(id);
        setWasWide(null);

        if (wideEligible.includes(id)) {
            // 🔑 KEY FIX: go to wide question step FIRST
            setStep('wide');
        } else if (NEEDS_WHO_OUT.includes(id)) {
            setStep(2); // ask who is out
        } else {
            setStep(3); // go directly to confirm
        }
    };

    const handleAfterWide = () => {
        // After answering wide question:
        if (NEEDS_WHO_OUT.includes(type)) {
            setStep(2); // runout → who is out?
        } else {
            setStep(3); // stumped / hitwicket → striker always out, skip to confirm
        }
    };

    // ── Step count for progress bar ────────────────────────────────────────
    // wide-eligible + NEEDS_WHO_OUT → 4 steps (type → wide → who → confirm)
    // wide-eligible only           → 3 steps (type → wide → confirm)
    // NEEDS_WHO_OUT only           → 3 steps (type → who → confirm)
    // others                       → 2 steps (type → confirm)
    let totalSteps = 2;
    if (wideEligible.includes(type) && NEEDS_WHO_OUT.includes(type)) totalSteps = 4;
    else if (wideEligible.includes(type) || NEEDS_WHO_OUT.includes(type)) totalSteps = 3;

    const stepNum = step === 1 ? 1 : step === 'wide' ? 2 : step === 2 ? (wideEligible.includes(type) ? 3 : 2) : totalSteps;

    // ── Confirm handler ────────────────────────────────────────────────────
    const handleConfirm = () => {
        if (!isLastWicket && !newBatsman.trim()) return alert('Please enter new batsman name!');
        const nLower = newBatsman.trim().toLowerCase();
        const bLower = currentBowler?.trim()?.toLowerCase();
        const sLower = currentStriker?.trim()?.toLowerCase();
        const nsLower = currentNonStriker?.trim()?.toLowerCase();

        if (nLower === bLower) {
            if (!window.confirm('Warning: New batsman has the same name as the current bowler. Proceed anyway?')) return;
        }
        if (nLower === sLower || nLower === nsLower) {
            if (!window.confirm('Warning: This batsman name is already on the field. Proceed anyway?')) return;
        }

        const outName = whoOut || currentStriker;
        let text = `${type} b ${currentBowler}`;
        if (type === 'caught')    text = fielderName ? `c ${fielderName} b ${currentBowler}` : `c & b ${currentBowler}`;
        else if (type === 'stumped')   text = fielderName ? `st ${fielderName} b ${currentBowler}` : `stumped b ${currentBowler}`;
        else if (type === 'runout')    text = fielderName ? `run out (${fielderName})` : `run out`;
        else if (type === 'hitwicket') text = `hit wicket b ${currentBowler}`;
        else if (type === 'retired')   text = `retired hurt`;
        if (wasWide) text += ' (off wide)';

        onWicket({
            type,
            outBatsmanName: outName,
            dismissalText: text,
            isBowlerWicket: !['runout', 'retired'].includes(type) && !isFreeHit,
            bowlerName: currentBowler,
            newBatsmanName: newBatsman,
            runsCompleted,
            fielderName,
            isWide: Boolean(wasWide),
            wideRuns: wasWide ? 1 : 0,
        });

        resetAll();
    };

    // ── Wide info text per dismissal type ─────────────────────────────────
    const wideInfoText = {
        stumped:   '🧤 Keeper can stump off a wide — ball is still live until it becomes dead.',
        runout:    '🏃 Batsmen can be run out off a wide — 1 wide extra is added, ball not counted.',
        hitwicket: '💥 Batsman can dislodge stumps attempting to play a wide delivery.',
    };

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="modal-overlay"
                    style={{ zIndex: 2000, alignItems: 'flex-end', padding: 0 }}
                >
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: '0%' }}
                        exit={{ y: '100%' }}
                        transition={SPRING_PRESET}
                        className="modal-content"
                        style={{ padding: '28px 24px', borderRadius: '28px 28px 0 0', maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                    >

                {/* ── Header ── */}
                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '900', color: '#1e1b4b', marginBottom: '4px' }}>
                        {step === 1       ? 'How was the batsman out?'
                        : step === 'wide' ? 'Off a Wide Ball?'
                        : step === 2      ? 'Wicket Details'
                        :                   'Confirm Wicket'}
                    </h3>
                    {isFreeHit && (
                        <p style={{ color: '#e94560', fontSize: '12px', fontWeight: '700', marginTop: '6px' }}>
                            ⚡ Free Hit Active — Only Run Out possible
                        </p>
                    )}
                    {/* Step progress bar */}
                    <div style={{ display: 'flex', gap: '5px', marginTop: '12px' }}>
                        {Array.from({ length: totalSteps }, (_, i) => (
                            <div key={i} style={{
                                height: '3px', flex: 1, borderRadius: '2px',
                                background: stepNum > i ? 'linear-gradient(90deg,#1e1b4b,#4338ca)' : '#f1f5f9',
                                transition: 'background 0.35s cubic-bezier(0.4,0,0.2,1)',
                            }} />
                        ))}
                    </div>
                </div>

                {/* ── Step 1: Dismissal type ── */}
                {step === 1 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {dismissals.map(d => {
                            const disabled = isFreeHit && d.id !== 'runout';
                            return (
                                <TapButton
                                    key={d.id}
                                    disabled={disabled}
                                    isSelected={type === d.id}
                                    onClick={() => handleDismissalPick(d.id)}
                                    style={{ height: '62px', fontSize: '14px', borderRadius: '16px' }}
                                >
                                    {d.label}
                                </TapButton>
                            );
                        })}
                    </div>
                )}

                {/* ── Step 'wide': Was it a wide ball? ── */}
                {step === 'wide' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Cricket rule info pill */}
                        <div style={{
                            background: 'rgba(139,92,246,0.08)',
                            border: '1px solid rgba(139,92,246,0.2)',
                            borderRadius: '12px', padding: '10px 14px',
                            fontSize: '12px', color: '#7c3aed',
                            fontWeight: '700', lineHeight: 1.5,
                        }}>
                            {wideInfoText[type] || ''}
                        </div>

                        <div>
                            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Was this off a Wide ball?
                            </p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <TapButton
                                    isSelected={wasWide === true}
                                    onClick={() => setWasWide(true)}
                                    rippleColor="rgba(139,92,246,0.2)"
                                    style={{ flex: 1, height: '56px', fontSize: '15px' }}
                                >
                                    ✅ Yes, Wide
                                </TapButton>
                                <TapButton
                                    isSelected={wasWide === false}
                                    onClick={() => setWasWide(false)}
                                    style={{ flex: 1, height: '56px', fontSize: '15px' }}
                                >
                                    ❌ Normal Ball
                                </TapButton>
                            </div>
                        </div>

                        <TapButton
                            isSelected={wasWide !== null}
                            disabled={wasWide === null}
                            onClick={handleAfterWide}
                            style={{ height: '52px', borderRadius: '16px', fontWeight: '900', fontSize: '15px' }}
                        >
                            Next ➡️
                        </TapButton>
                    </div>
                )}

                {/* ── Step 2: Who is out + runs completed ── */}
                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Wide reminder */}
                        {wasWide && (
                            <div style={{
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: '10px', padding: '8px 12px',
                                fontSize: '12px', color: '#b45309', fontWeight: '700',
                            }}>
                                📌 Wide ball — +1 wide extra, delivery NOT counted
                            </div>
                        )}

                        <div>
                            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {type === 'retired' ? 'Who is retiring?' : 'Who is out?'}
                            </p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <TapButton isSelected={whoOut === currentStriker} onClick={() => setWhoOut(currentStriker)} style={{ flex: 1, height: '52px' }}>
                                    {currentStriker}
                                </TapButton>
                                <TapButton isSelected={whoOut === currentNonStriker} onClick={() => setWhoOut(currentNonStriker)} style={{ flex: 1, height: '52px' }}>
                                    {currentNonStriker}
                                </TapButton>
                            </div>
                        </div>

                        {type === 'runout' && (
                            <div>
                                <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Runs Completed?
                                </p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[0, 1, 2, 3].map(r => (
                                        <TapButton key={r} isSelected={runsCompleted === r} onClick={() => setRunsCompleted(r)} style={{ flex: 1, height: '48px', fontSize: '16px', fontWeight: '900' }}>
                                            {r}
                                        </TapButton>
                                    ))}
                                </div>
                            </div>
                        )}

                        <TapButton
                            isSelected={true}
                            onClick={() => setStep(3)}
                            style={{ height: '54px', borderRadius: '16px', fontWeight: '900', fontSize: '15px' }}
                        >
                            Next Step ➡️
                        </TapButton>
                    </div>
                )}

                {/* ── Step 3: New batsman + fielder + confirm ── */}
                {step === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {wasWide && (
                            <div style={{
                                background: 'rgba(245,158,11,0.08)',
                                border: '1px solid rgba(245,158,11,0.25)',
                                borderRadius: '10px', padding: '8px 12px',
                                fontSize: '12px', color: '#b45309', fontWeight: '700',
                            }}>
                                📌 Wide ball — +1 wide extra, delivery NOT counted
                            </div>
                        )}

                        {!isLastWicket && (
                            <div>
                                <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    New Batsman Name
                                </p>
                                <NameInput
                                    placeholder="Enter name"
                                    value={newBatsman}
                                    onChange={(val) => setNewBatsman(val.toUpperCase())}
                                    style={{ input: { marginBottom: '0' } }}
                                />
                            </div>
                        )}

                        {['caught', 'stumped', 'runout'].includes(type) && (
                            <div>
                                <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Fielder Name (Optional)
                                </p>
                                <NameInput
                                    placeholder="Enter fielder name"
                                    value={fielderName}
                                    onChange={(val) => setFielderName(val.toUpperCase())}
                                    style={{ input: { marginBottom: '0' } }}
                                />
                            </div>
                        )}

                        <TapButton
                            isSelected={true}
                            onClick={handleConfirm}
                            rippleColor="rgba(255,255,255,0.4)"
                            style={{ height: '58px', borderRadius: '18px', fontWeight: '900', fontSize: '16px', marginTop: '4px' }}
                        >
                            Confirm Wicket ☝️
                        </TapButton>
                    </div>
                )}

                {/* ── Cancel ── */}
                <TapButton
                    onClick={() => { resetAll(); onClose(); }}
                    isSelected={false}
                    rippleColor="rgba(107,114,128,0.2)"
                    style={{ marginTop: '14px', height: '46px', borderRadius: '14px', color: '#6b7280', fontSize: '14px', fontWeight: '700', border: 'none', background: '#f8fafc' }}
                >
                    Cancel
                </TapButton>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(WicketModal);
