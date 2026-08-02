import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft, ClipboardList, Settings, Share2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import WagonWheelModal from '../components/WagonWheelModal';
import WicketModal from '../components/WicketModal';
import OverCompleteModal from '../components/OverCompleteModal';
import CatchDropModal from '../components/CatchDropModal';
import EditNameModal from '../components/EditNameModal';
import wagonWheelIcon from '../assets/wagon-wheel.png';
import NameInput from '../components/NameInput';
import { playBallSound, playIntroSound, isMemeMode } from '../utils/soundPlayer';
import { getMatchTimestamp } from '../utils/dataFetcher';

// Sub-components
import InningsHeader from '../components/LiveScoring/InningsHeader';
import BatsmenTable from '../components/LiveScoring/BatsmenTable';
import BowlerTable from '../components/LiveScoring/BowlerTable';
import OverTimeline from '../components/LiveScoring/OverTimeline';
import ScoreControls from '../components/LiveScoring/ScoreControls';

const LiveScoring = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { state, dispatch, historyLength } = useMatch();

    // When navigating back FROM InningsBreak, this flag is set to prevent the
    // innings_break auto-redirect from immediately bouncing the user back.
    const skipBreakRedirect = location.state?.skipBreakRedirect === true;

    const [showWagonWheel, setShowWagonWheel] = useState(false);
    const [showWicketModal, setShowWicketModal] = useState(false);
    const [showCatchDropModal, setShowCatchDropModal] = useState(false);
    const [showOverModal, setShowOverModal] = useState(false);
    const [wagonWheelMode, setWagonWheelMode] = useState(true);
    const [pendingRun, setPendingRun] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [tempOvers, setTempOvers] = useState(state?.totalOvers || 5);
    const [showRetireModal, setShowRetireModal] = useState(false);
    const [whoIsRetiring, setWhoIsRetiring] = useState('');
    const [newBatsmanAfterRetire, setNewBatsmanAfterRetire] = useState('');
    const [showPartnership, setShowPartnership] = useState(false);
    const [extras, setExtras] = useState({ wide: false, noBall: false, byes: false, legByes: false, wicket: false });
    const [editInfo, setEditInfo] = useState(null);
    const [memeMode, setMemeMode] = useState(false);

    useEffect(() => {
        // Auto-off Meme mode of start node
        localStorage.setItem("cricscorer_meme_mode", "false");
        // We do not call setMemeMode(false) because it is already false in state node Node flawlessly setup flawslessly!
    }, []);

    const toggleMemeMode = () => {
        const newVal = !memeMode;
        setMemeMode(newVal);
        localStorage.setItem("cricscorer_meme_mode", newVal.toString());
    };

    const currentInningsIdx = (state && state.currentInnings) ? state.currentInnings - 1 : 0;
    const innings = useMemo(() => (state && state.innings) ? state.innings[currentInningsIdx] : null, [state?.innings, currentInningsIdx]);
    const striker = useMemo(() => innings?.batsmen?.find(b => b.isStriker) || null, [innings?.batsmen]);
    const nonStriker = useMemo(() => innings?.batsmen?.find(b => !b.isStriker && !b.isOut) || null, [innings?.batsmen]);
    const currentBowler = useMemo(() => {
        if (!innings?.bowlers?.length) return null;
        if (innings.currentBowlerName) {
            return innings.bowlers.find(b => b.name === innings.currentBowlerName) || innings.bowlers[innings.bowlers.length - 1];
        }
        return innings.bowlers[innings.bowlers.length - 1];
    }, [innings?.bowlers, innings?.currentBowlerName]);

    const partnership = useMemo(() => {
        if (!innings?.timeline) return { runs: 0, balls: 0 };
        const lastWicketIdx = innings.timeline.map(b => b.isWicket).lastIndexOf(true);
        const currentBalls = lastWicketIdx === -1 ? innings.timeline : innings.timeline.slice(lastWicketIdx + 1);
        const runs = currentBalls.reduce((sum, b) => sum + b.runs + (b.isWide || b.isNoBall ? 1 : 0), 0);
        const balls = currentBalls.filter(b => !b.isWide && !b.isNoBall).length;
        return { runs, balls };
    }, [innings?.timeline]);

    useEffect(() => {
        if (state?.matchStatus === 'complete') {
            if (state.isTournamentMatch) {
                completeTournamentMatch(state.tournamentId, state.matchId, state);
            }
        } else if (state?.matchStatus === 'innings_break') {
            // ── NO AUTO-REDIRECT ──
            // 'Start 2nd Innings' button on the live scoring screen handles this.
            // Prevents unwanted redirects after undo/re-score on the last ball.
            if (state.isTournamentMatch) {
                saveTournamentMatchLive(state.tournamentId, state.matchId, state);
            }
        } else if (state?.matchStatus === 'live' && state.isTournamentMatch) {
            saveTournamentMatchLive(state.tournamentId, state.matchId, state);
        }
    }, [state?.matchStatus, state?.innings, state?.balls, navigate, state, skipBreakRedirect]);

    const saveTournamentMatchLive = (tournamentId, matchId, matchState) => {
        const existing = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const tIndex = existing.findIndex(t => t.tournamentId === tournamentId);
        if (tIndex === -1) return;
        const t = existing[tIndex];
        const mIndex = t.matches.findIndex(m => m.matchId === matchId);
        if (mIndex === -1) return;

        t.matches[mIndex].status = 'live';
        // You could update ongoing live scores here
        const inn1 = matchState.innings[0];
        const inn2 = matchState.innings[1];
        if (inn1) t.matches[mIndex].team1Score = { runs: inn1.runs, wickets: inn1.wickets, overs: inn1.overs };
        if (inn2) t.matches[mIndex].team2Score = { runs: inn2.runs, wickets: inn2.wickets, overs: inn2.overs };

        existing[tIndex] = t;
        localStorage.setItem('cricscore_tournaments', JSON.stringify(existing));

        try {
            const tDoc = doc(db, 'tournaments', tournamentId);
            setDoc(tDoc, t, { merge: true }).catch(() => { });
        } catch (e) { }
    };

    const completeTournamentMatch = (tournamentId, matchId, matchState) => {
        const existing = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
        const tIndex = existing.findIndex(t => t.tournamentId === tournamentId);
        if (tIndex === -1) return;

        const t = existing[tIndex];
        const mIndex = t.matches.findIndex(m => m.matchId === matchId);
        if (mIndex === -1) return;

        const match = t.matches[mIndex];
        match.status = 'completed';

        let resultString = '';
        if (matchState.winner === 'Tie' || !matchState.winner) {
            resultString = 'Match Tied';
            match.winnerId = null;
            match.winnerName = 'Tie';
        } else {
            resultString = `${matchState.winner} won by ${matchState.winMargin} ${matchState.winType}`;
            match.winnerName = matchState.winner;
            match.winnerId = match.team1Name === matchState.winner ? match.team1Id : match.team2Id;
        }
        match.result = resultString;

        // Update scores
        const inn1 = matchState.innings[0];
        const inn2 = matchState.innings[1];
        if (inn1) {
            if (inn1.battingTeam === match.team1Name) match.team1Score = { runs: inn1.runs, wickets: inn1.wickets, overs: inn1.overs, balls: inn1.balls };
            else match.team2Score = { runs: inn1.runs, wickets: inn1.wickets, overs: inn1.overs, balls: inn1.balls };
        }
        if (inn2) {
            if (inn2.battingTeam === match.team2Name) match.team2Score = { runs: inn2.runs, wickets: inn2.wickets, overs: inn2.overs, balls: inn2.balls };
            else match.team1Score = { runs: inn2.runs, wickets: inn2.wickets, overs: inn2.overs, balls: inn1.balls };
        }

        // Logic for next fixtures
        if (match.stage !== 'group') {
            const stageMatches = t.matches.filter(m => m.stage === match.stage);
            if (stageMatches.every(m => m.status === 'completed')) {
                let nextStage = '';
                if (match.stage === 'quarterfinal') nextStage = 'semifinal';
                else if (match.stage === 'semifinal') nextStage = 'final';
                // (Note: in tournamentLogic, this might be handled better, but continuing based on instructions)
                if (nextStage) {
                    const newMatches = [];
                    for (let i = 0; i < stageMatches.length; i += 2) {
                        const m1 = stageMatches[i];
                        const m2 = stageMatches[i + 1];
                        if (m1 && m2 && m1.winnerId && m2.winnerId) {
                            newMatches.push({
                                matchId: `m_${Date.now()}_${i}`,
                                team1Id: m1.winnerId,
                                team2Id: m2.winnerId,
                                team1Name: m1.winnerName,
                                team2Name: m2.winnerName,
                                stage: nextStage,
                                status: 'upcoming',
                                matchNumber: t.matches.length + newMatches.length + 1
                            });
                        }
                    }
                    t.matches = [...t.matches, ...newMatches];
                }
            }
        }

        if (t.format === 'roundrobin' || t.format === 'group_knockout') {
            // we'll recalculate externally or just re-import updatePointsTable. 
            // wait, we can just rely on tournamentLogic to do the heavy lifting later if we want.
            // Actually, we must import updatePointsTable
        }

        // We will just call the already written one in tournamentLogic!
        import('../utils/tournamentLogic').then(module => {
            module.updateTournamentMatch(tournamentId, matchId, matchState).then(() => {
                // No auto-navigate, let the user click the button.
            });
        }).catch(err => {
            console.error(err);
        });
    };

    // ── OVER COMPLETE MODAL TRIGGER ─────────────────────────────────────────────────────────────
    // Uses a ref to track the PREVIOUS legalBalls count.
    // Only shows the modal when legalBalls INCREASES to 6 (prev=5 → curr=6).
    // This prevents the modal from showing on:
    //   • UNDO of NEW_OVER: restores thisOver 0 → 6  (prev=0, not 5 → no modal)
    //   • Component mount with 6 balls already in thisOver (prev=0 → no modal)
    //   • innings_break / complete status
    //   • Last over of innings (isInningsLive = false → render gate blocks it anyway)
    // ───────────────────────────────────────────────────────────────────────────
    const prevLegalBallsRef = useRef(0);
    useEffect(() => {
        if (!innings?.thisOver) return;
        // Guard: match already done
        if (state?.matchStatus === 'innings_break' || state?.matchStatus === 'complete') return;
        // Guard: overs exhausted (last over of innings — 'Start 2nd Innings' button handles this)
        const totalOversLimit = state?.totalOvers || 0;
        if (totalOversLimit > 0 && (innings?.balls || 0) >= totalOversLimit * 6) return;

        const legalBalls = innings.thisOver.filter(b => !b.isWide && !b.isNoBall).length;
        const prev = prevLegalBallsRef.current;
        prevLegalBallsRef.current = legalBalls;

        // Only trigger when count TRANSITIONS to 6 (not on restore/mount)
        if (legalBalls === 6 && prev === 5 && !showWicketModal) {
            setShowOverModal(true);
        } else if (legalBalls < 6) {
            // Clear any stuck modal state if user undoes a ball
            setShowOverModal(false);
        }
    }, [innings?.thisOver, innings?.balls, showWicketModal, state?.matchStatus, state?.totalOvers]);

    const toggleExtra = useCallback((key) => setExtras(p => ({ ...p, [key]: !p[key] })), []);

    const handleRunClick = useCallback((runs) => {
        if (!currentBowler) return alert('Please select a bowler first');

        const legalBalls = innings?.thisOver?.filter(b => !b.isWide && !b.isNoBall).length || 0;
        if (legalBalls >= 6) {
            setShowOverModal(true);
            return;
        }

        const matchSettings = state?.settings || {};
        let extraRuns = 0;
        if (extras.wide) {
            extraRuns = matchSettings.wideBallEnabled !== false ? (Number(matchSettings.wideBallRuns) || 1) : 0;
        } else if (extras.noBall) {
            extraRuns = matchSettings.noBallEnabled !== false ? (Number(matchSettings.noBallRuns) || 1) : 0;
        }

        const ballData = {
            runs, extras: extraRuns,
            extraType: extras.wide ? 'wide' : (extras.noBall ? 'noBall' : null),
            isWide: extras.wide, isNoBall: extras.noBall, isBye: extras.byes, isLegBye: extras.legByes, isWicket: extras.wicket,
            bowlerName: currentBowler.name, batsmanName: striker?.name, timestamp: Date.now()
        };

        if (extras.wicket) return setShowWicketModal(true);
        if (wagonWheelMode && runs > 0) {
            setPendingRun(ballData);
            setShowWagonWheel(true);
        } else {
            dispatch({ type: 'ADD_BALL', payload: { ball: ballData } });
            playBallSound(ballData, innings?.thisOver || [], state.currentInnings || 1, striker?.name || "");
        }
        setExtras({ wide: false, noBall: false, byes: false, legByes: false, wicket: false });
    }, [currentBowler, extras, striker?.name, wagonWheelMode, dispatch, innings?.thisOver, state.currentInnings]);

    const handleWagonChoice = useCallback((zone) => {
        const ball = { ...pendingRun, zone };
        dispatch({ type: 'ADD_BALL', payload: { ball } });
        playBallSound(ball, innings?.thisOver || [], state.currentInnings || 1, striker?.name || "");
        setShowWagonWheel(false);
        setPendingRun(null);
    }, [pendingRun, dispatch, innings?.thisOver, state.currentInnings, striker?.name]);

    const onWicket = useCallback((wicketData) => {
        const batsmen = state.innings[state.currentInnings - 1]?.batsmen || [];
        const nLower = wicketData.newBatsmanName?.trim()?.toLowerCase();

        if (nLower) {
            const existing = batsmen.find(b => b.name.trim().toLowerCase() === nLower);
            if (existing && existing.isOut && existing.dismissalType !== 'retired') {
                return alert('This player is already OUT and cannot bat again in this innings!');
            }
        }

        dispatch({ type: 'WICKET', payload: { wicketData } });
        
        try {
            if (nLower) {
                import('../utils/nameStorage').then(m => m.unblockNameFromStorage && m.unblockNameFromStorage(wicketData.newBatsmanName));
            }
        } catch(e) {}

        setShowWicketModal(false);
        setExtras(p => ({ ...p, wicket: false }));
        if (wicketData.type !== 'retired') {
            playBallSound({ isWicket: true }, innings?.thisOver || [], state.currentInnings || 1);
        }
    }, [dispatch, state.innings, state.currentInnings]);

    const onCatchDropConfirm = useCallback(({ fielderName, runs, isNoBall }) => {
        if (!currentBowler) return;
        const matchSettings = state?.settings || {};
        let extraRuns = 0;
        if (isNoBall) {
            extraRuns = matchSettings.noBallEnabled !== false ? (Number(matchSettings.noBallRuns) || 1) : 0;
        }

        const ballData = {
            runs,
            extras: extraRuns,
            extraType: isNoBall ? 'noBall' : null,
            isWide: false,
            isNoBall,
            isWicket: false,
            bowlerName: currentBowler.name,
            batsmanName: striker?.name,
            timestamp: Date.now(),
            droppedCatch: {
                fielderName,
                batsmanName: striker?.name
            }
        };

        dispatch({ type: 'ADD_BALL', payload: { ball: ballData } });
        playBallSound(ballData, innings?.thisOver || [], state.currentInnings || 1, striker?.name || "");
        setShowCatchDropModal(false);
    }, [currentBowler, striker?.name, dispatch, innings?.thisOver, state.currentInnings, state?.settings]);

    const onOverComplete = useCallback((nextData) => {
        // Guard: never start a new over when innings is already complete.
        // This can happen when the Over Complete modal was shown for the LAST over
        // and the user clicks "Start Next Over" before the innings_break redirect fires.
        if (state?.matchStatus !== 'live') {
            setShowOverModal(false);
            return;
        }
        // Also check ball count — if innings overs are exhausted, close and return.
        const inn = state?.innings?.[state?.currentInnings - 1];
        const totalOversLimit = state?.totalOvers || 0;
        if (totalOversLimit > 0 && (inn?.balls || 0) >= totalOversLimit * 6) {
            setShowOverModal(false);
            return;
        }
        const bowlerName = typeof nextData === 'string' ? nextData : (nextData?.newBowler || nextData?.name || '');
        dispatch({ type: 'NEW_OVER', payload: { newBowlerName: bowlerName } });
        
        try {
            if (bowlerName) {
                import('../utils/nameStorage').then(m => m.unblockNameFromStorage && m.unblockNameFromStorage(bowlerName));
            }
        } catch(e) {}

        setShowOverModal(false);
    }, [state?.matchStatus, state?.innings, state?.currentInnings, state?.totalOvers, dispatch]);

    const handleRetire = useCallback(() => {
        if (!whoIsRetiring || !newBatsmanAfterRetire) return;

        const nLower = newBatsmanAfterRetire.trim().toLowerCase();
        const sLower = striker?.name?.trim().toLowerCase();
        const nsLower = nonStriker?.name?.trim().toLowerCase();
        const bLower = currentBowler?.name?.trim().toLowerCase();

        if (nLower === sLower || nLower === nsLower) {
            return alert('New batsman is already on the field!');
        }
        if (bLower && nLower === bLower) {
            return alert('New batsman cannot be the current bowler!');
        }

        onWicket({
            type: 'retired',
            outBatsmanName: whoIsRetiring,
            dismissalText: 'retired hurt',
            isBowlerWicket: false,
            bowlerName: currentBowler?.name,
            newBatsmanName: newBatsmanAfterRetire.trim()
        });

        setShowRetireModal(false);
        setWhoIsRetiring('');
        setNewBatsmanAfterRetire('');
    }, [whoIsRetiring, newBatsmanAfterRetire, currentBowler?.name, onWicket]);

    const handleNameClick = useCallback((name, type = 'player') => {
        setEditInfo({ oldName: name, newName: name, type });
    }, []);

    const confirmRename = useCallback(() => {
        if (editInfo && editInfo.newName.trim() && editInfo.newName !== editInfo.oldName) {
            if (editInfo.type === 'team') {
                const otherTeam = state.team1.name === editInfo.oldName ? state.team2.name : state.team1.name;
                if (editInfo.newName.trim().toLowerCase() === otherTeam?.toLowerCase()) {
                    alert('Team names must be unique!');
                    return;
                }
            }

            // DUPLICATE PLAYER CHECK: Only block same role in same innings
            if (editInfo.type !== 'team') {
                const newNameLower = editInfo.newName.trim().toLowerCase();
                const oldNameLower = editInfo.oldName.trim().toLowerCase();
                const innIdx = state.currentInnings - 1;
                const inn = state.innings[innIdx];

                if (inn) {
                    // On LiveScoring, editInfo.type is 'batsman' or 'bowler'
                    const role = editInfo.type;
                    const listToCheck = role === 'bowler' ? (inn.bowlers || []) : (inn.batsmen || []);
                    const duplicate = listToCheck.find(
                        p => p.name?.trim().toLowerCase() === newNameLower && p.name?.trim().toLowerCase() !== oldNameLower
                    );
                    if (duplicate && role !== 'bowler') {
                        alert(`A different batsman named "${editInfo.newName.trim()}" already exists in this innings!`);
                        return;
                    }
                }
            }

            dispatch({
                type: editInfo.type === 'team' ? 'RENAME_TEAM' : 'RENAME_PLAYER',
                payload: { oldName: editInfo.oldName, newName: editInfo.newName, role: editInfo.type, innIndex: state.currentInnings - 1 }
            });

            try {
                if (editInfo.type !== 'team') {
                    import('../utils/nameStorage').then(m => m.unblockNameFromStorage && m.unblockNameFromStorage(editInfo.newName));
                }
            } catch(e) {}
        }
        setEditInfo(null);
    }, [editInfo, state.team1.name, state.team2.name, state.currentInnings, state.innings, dispatch]);

    const updateOvers = useCallback(() => {
        const newO = parseInt(tempOvers);
        if (isNaN(newO) || newO <= 0) return alert('Please enter a valid number of overs');

        const ballsCount = innings?.balls || 0;
        const minimumOvers = Math.ceil(ballsCount / 6);

        if (newO < minimumOvers) {
            return alert(`Cannot reduce overs! ${minimumOvers} over(s) are already completed.`);
        }

        dispatch({
            type: 'UPDATE_STATE',
            payload: { totalOvers: newO }
        });
        setMenuOpen(false);
    }, [tempOvers, dispatch, innings?.balls]);

    useEffect(() => {
        if (state?.settings) setTempOvers(state.totalOvers);
    }, [state?.totalOvers]);

    useEffect(() => {
        if (striker?.name) playIntroSound(striker.name);
        if (nonStriker?.name) playIntroSound(nonStriker.name);
    }, [striker?.name, nonStriker?.name]);

    const handleOpenWicketModal = useCallback(() => {
        const legalBalls = innings?.thisOver?.filter(b => !b.isWide && !b.isNoBall).length || 0;
        if (legalBalls >= 6) {
            setShowOverModal(true);
            return;
        }
        setShowWicketModal(true);
    }, [innings?.thisOver]);

    if (!state || !innings) return null;

    // ── INNINGS LIVE GATE ────────────────────────────────────────────────────────
    // True only when the innings is genuinely running and overs are not exhausted.
    // Used to suppress OverCompleteModal when back-navigation brings us to a
    // completed innings — ensures Cancel can't get stuck in a re-fire loop.
    const totalOversLimit = state.totalOvers || 0;
    const isSuperOver = state.currentInnings > 2;
    const wicketLimit = isSuperOver ? 2 : (state.playersPerTeam - 1);
    const isAllOut = innings.wickets >= wicketLimit;

    const isInningsLive =
        state.matchStatus === 'live' &&
        !(totalOversLimit > 0 && (innings.balls || 0) >= totalOversLimit * 6) &&
        !isAllOut;

    const matchTimestamp = state.startTime || getMatchTimestamp(state) || Date.now();
    const formattedDate = new Date(matchTimestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    let statusText = '';
    if (state.matchStatus === 'complete') {
        statusText = state.winner === 'Tie' ? 'Match Tied' : (state.winner ? `${state.winner} won` : 'Match Complete');
    } else if (state.tossWinner) {
        const choice = state.batFirst === state.tossWinner ? 'bat' : 'bowl';
        statusText = `Toss: ${state.tossWinner} (${choice})`;
    }

    return (
        <div style={{ backgroundColor: 'var(--bg-color)', minHeight: '100vh', paddingBottom: '30px' }}>
            <div className="header" style={{ height: '64px', padding: '0 16px', display: 'flex', alignItems: 'center', borderBottom: 'none' }}>
                <div style={{ marginRight: '12px', cursor: 'pointer' }} onClick={() => navigate('/home')}><ChevronLeft size={24} /></div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontWeight: '800', fontSize: '15px', color: '#1e1b4b' }}>
                        {state.team1?.name} vs {state.team2?.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginTop: '2px' }}>
                        {formattedDate}{statusText ? ` • ${statusText}` : ''}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div onClick={() => setMenuOpen(!menuOpen)} style={{ padding: '6px' }}><Settings size={20} /></div>
                    <div onClick={() => navigate('/scorecard')} style={{ padding: '6px' }}><ClipboardList size={20} color="var(--primary)" /></div>
                </div>
            </div>

            {menuOpen && (
                <>
                    <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1499 }} />

                    <div className="bottom-sheet animate-slide-up" style={{ position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: 1500, padding: '24px', background: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', border: '1px solid #f1f5f9', boxShadow: '0 -4px 30px rgba(0,0,0,0.08)', color: '#1e1b4b' }}>
                        <div style={{ width: '40px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', margin: '0 auto 20px auto' }} onClick={() => setMenuOpen(false)}></div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(56,139,253,0.12)', color: '#388bfd' }}>🎯</div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e1b4b' }}>Wagon Wheel</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Track run directions</div>
                                </div>
                            </div>
                            <label className="toggle-3d">
                                <input type="checkbox" checked={wagonWheelMode} onChange={() => setWagonWheelMode(!wagonWheelMode)} />
                                <div className="toggle-track"><div className="toggle-thumb"></div></div>
                            </label>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(155,89,182,0.12)', color: '#9b59b6' }}>🎵</div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e1b4b' }}>Meme Mode</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Funny sounds on boundaries</div>
                                </div>
                            </div>
                            <label className="toggle-3d">
                                <input type="checkbox" checked={memeMode} onChange={toggleMemeMode} />
                                <div className="toggle-track"><div className="toggle-thumb"></div></div>
                            </label>
                        </div>

                        {state.currentInnings === 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,69,96,0.12)', color: '#e94560' }}>⏱️</div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e1b4b' }}>Match Overs</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>Adjust match limit</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button onClick={() => setTempOvers(p => Math.max(1, parseInt(p) - 1))} style={{ width: '28px', height: '28px', padding: 0, borderRadius: '8px', border: '1px solid rgba(233,69,96,0.4)', background: 'rgba(233,69,96,0.05)', color: '#e94560', fontWeight: '700', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>-</button>
                                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#1e1b4b', minWidth: '24px', textAlign: 'center' }}>{tempOvers}</div>
                                    <button onClick={() => setTempOvers(p => parseInt(p) + 1)} style={{ width: '28px', height: '28px', padding: 0, borderRadius: '8px', border: '1px solid rgba(233,69,96,0.4)', background: 'rgba(233,69,96,0.05)', color: '#e94560', fontWeight: '700', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</button>
                                </div>
                            </div>
                        )}

                        <div onClick={() => navigate('/match-settings')} style={{ cursor: 'pointer', color: '#e94560', fontWeight: '700', fontSize: '13px', textAlign: 'center', padding: '15px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            ⚙️ Advanced Settings
                        </div>

                        {state.currentInnings === 1 && (
                            <button onClick={updateOvers} style={{ width: '100%', padding: '13px', marginTop: '10px', borderRadius: '14px', background: 'linear-gradient(135deg, #e94560, #c73652)', border: 'none', color: 'white', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(233,69,96,0.3)', inset: 0 }}>
                                Save Settings
                            </button>
                        )}
                    </div>
                </>
            )}

            <div style={{ padding: '12px' }}>
                <InningsHeader innings={innings} state={state} onTeamClick={handleNameClick} />
                {showPartnership && <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '10px', fontSize: '13px', fontWeight: '800', color: 'var(--primary)', backgroundColor: 'rgba(79, 70, 229, 0.05)', borderRadius: '12px', marginBottom: '8px' }}>Partnership: {partnership.runs} ({partnership.balls})</div>}
                <BatsmenTable striker={striker} nonStriker={nonStriker} onNameClick={handleNameClick} />
                <BowlerTable currentBowler={currentBowler} onNameClick={handleNameClick} />
                <OverTimeline thisOver={innings.thisOver} />
                
                {/* ── INNINGS COMPLETE BANNER (replaces scoring controls) ─────────────────────
                    Shows when innings is NOT live:
                    - matchStatus === 'innings_break'  (all overs/wickets done)
                    - OR balls >= totalOvers * 6       (overs exhausted, status may lag)
                    
                    No auto-redirect. User taps 'Start 2nd Innings' to proceed.
                    If they undo a ball: isInningsLive flips back to true → controls return.
                ─────────────────────────────────────────────────────────────────────────── */}
                <ScoreControls
                    extras={extras} toggleExtra={toggleExtra} handleRunClick={handleRunClick}
                    setShowWicketModal={handleOpenWicketModal} setShowRetireModal={setShowRetireModal}
                    setShowCatchDropModal={setShowCatchDropModal}
                    dispatch={dispatch} showPartnership={showPartnership} setShowPartnership={setShowPartnership} currentBowler={currentBowler}
                    historyLength={historyLength} timelineBalls={innings?.timeline?.length || 0} settings={state.settings} isInningsLive={isInningsLive}
                />

                {/* ── SLIM STRIP FOR INNINGS COMPLETE / MATCH COMPLETE ───────────────────── */}
                {!isInningsLive && (
                    <div style={{ marginTop: '14px' }}>
                        <button
                            onClick={() => {
                                if (state?.matchStatus === 'complete') {
                                    if (state.isTournamentMatch) navigate(`/tournament/${state.tournamentId}`);
                                    else navigate('/congratulations');
                                } else {
                                    navigate('/innings-break');
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '14px 20px',
                                borderRadius: '16px',
                                border: 'none',
                                cursor: 'pointer',
                                background: state?.matchStatus === 'complete' ? 'linear-gradient(135deg, #0f172a 0%, #334155 100%)' : 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                                color: 'white',
                                fontWeight: '900',
                                fontSize: '15px',
                                letterSpacing: '0.4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: state?.matchStatus === 'complete' ? '0 4px 18px rgba(15,23,42,0.28)' : '0 4px 18px rgba(67,56,202,0.28)'
                            }}
                        >
                            <span style={{ fontSize: '18px' }}>{state?.matchStatus === 'complete' ? '🏆' : '🏏'}</span>
                            {state?.matchStatus === 'complete' ? 'View Result' : 'Start 2nd Innings'}
                            <span style={{ marginLeft: '2px', opacity: 0.8 }}>→</span>
                        </button>
                        <div style={{
                            textAlign: 'center',
                            fontSize: '13px',
                            color: (isAllOut || state?.matchStatus === 'complete') ? '#ef4444' : '#94a3b8',
                            marginTop: '12px',
                            fontWeight: '800'
                        }}>
                            {state?.matchStatus === 'complete' ? (
                                state.winner === 'Tie' || !state.winner ? '🤝 Match Tied!' : `🎉 Match won by ${state.winner}`
                            ) : (
                                isAllOut ? '⚠️ ALL OUT! · ' : '1st innings complete · '
                            )}
                            {state?.matchStatus !== 'complete' && ` ${innings.runs}/${innings.wickets} in ${innings.overs} ov`}
                        </div>
                        <div style={{
                            textAlign: 'center',
                            fontSize: '11px',
                            color: '#cbd5e1',
                            marginTop: '4px',
                            fontWeight: '600'
                        }}>
                            Undo to make changes
                        </div>
                    </div>
                )}
            </div>

            {showWagonWheel && (
                <WagonWheelModal show={showWagonWheel} onSelect={handleWagonChoice} onSkip={() => handleWagonChoice(null)} pendingRuns={pendingRun?.runs} />
            )}
            {showWicketModal && (
                <WicketModal
                    show={showWicketModal}
                    currentStriker={striker?.name}
                    currentNonStriker={nonStriker?.name}
                    currentBowler={currentBowler?.name}
                    isFreeHit={state.isFreehitNext}
                    isLastWicket={innings.wickets + 1 >= wicketLimit}
                    settings={state.settings}
                    onWicket={onWicket}
                    onClose={() => { setShowWicketModal(false); setExtras(p => ({ ...p, wicket: false })); }}
                />
            )}
            {showCatchDropModal && (
                <CatchDropModal
                    show={showCatchDropModal}
                    currentStriker={striker?.name}
                    currentBowler={currentBowler?.name}
                    settings={state.settings}
                    onConfirm={onCatchDropConfirm}
                    onClose={() => setShowCatchDropModal(false)}
                />
            )}
            {showOverModal && isInningsLive && (
                <OverCompleteModal show={showOverModal} onStartNext={onOverComplete} onClose={() => setShowOverModal(false)} lastOverBowler={currentBowler?.name} striker={striker?.name} nonStriker={nonStriker?.name} innings={innings} state={state} />
            )}

            {showRetireModal && (
                <div className="modal-overlay" style={{ zIndex: 50000 }}>
                    <div className="modal-content animate-fade-in" style={{ padding: '28px' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1e1b4b', marginBottom: '20px', textAlign: 'center' }}>Retire Batsman 🏃</h3>

                        <div style={{ marginBottom: '24px' }}>
                            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '12px', textTransform: 'uppercase' }}>Who is retiring?</p>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className={whoIsRetiring === striker?.name ? 'primary' : 'secondary'}
                                    onClick={() => setWhoIsRetiring(striker?.name)}
                                    style={{ flex: 1, height: '50px', fontSize: '14px' }}
                                >
                                    {striker?.name}
                                </button>
                                <button
                                    className={whoIsRetiring === nonStriker?.name ? 'primary' : 'secondary'}
                                    onClick={() => setWhoIsRetiring(nonStriker?.name)}
                                    style={{ flex: 1, height: '50px', fontSize: '14px' }}
                                >
                                    {nonStriker?.name}
                                </button>
                            </div>
                        </div>

                        <div style={{ marginBottom: '28px' }}>
                            <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '700', marginBottom: '12px', textTransform: 'uppercase' }}>Incoming Batsman Name</p>
                            <NameInput
                                placeholder="Enter new batsman name"
                                value={newBatsmanAfterRetire}
                                onChange={(val) => setNewBatsmanAfterRetire(val)}
                                style={{ input: { height: '52px', borderRadius: '14px' } }}
                            />
                        </div>

                        <button
                            className="primary"
                            disabled={!whoIsRetiring || !newBatsmanAfterRetire}
                            style={{
                                width: '100%',
                                height: '60px',
                                borderRadius: '18px',
                                fontWeight: '900',
                                marginBottom: '12px',
                                opacity: (!whoIsRetiring || !newBatsmanAfterRetire) ? 0.5 : 1
                            }}
                            onClick={handleRetire}
                        >
                            CONFIRM RETIRE
                        </button>
                        <button
                            className="secondary"
                            style={{ width: '100%', height: '48px', border: 'none', color: '#94a3b8', fontWeight: '700' }}
                            onClick={() => { setShowRetireModal(false); setWhoIsRetiring(''); setNewBatsmanAfterRetire(''); }}
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}

            <EditNameModal
                info={editInfo}
                onClose={() => setEditInfo(null)}
                onSave={confirmRename}
                onChange={(val) => setEditInfo(prev => ({ ...prev, newName: val }))}
            />
        </div>
    );
};

export default LiveScoring;
