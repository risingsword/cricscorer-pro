import React, { useState, useMemo, useLayoutEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMatch } from '../context/MatchContext';
import { ChevronLeft, Share2, Download, CheckCircle2, AlertCircle, ChevronDown, Clock } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import wagonWheelIcon from '../assets/wagon-wheel.png';
import EditNameModal from '../components/EditNameModal';
import WagonWheelVisuals from '../components/WagonWheelVisuals';
import OverByOverChart from '../components/OverByOverChart';
import { getMatchTimestamp } from '../utils/dataFetcher';

const Scorecard = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { state, dispatch } = useMatch();
    const [editInfo, setEditInfo] = useState(null); // { oldName: '', newName: '' }
    const [activeTab, setActiveTab] = useState('scoreboard');
    const [expandedOvers, setExpandedOvers] = useState({});
    const [selectedInnIdx, setSelectedInnIdx] = useState(state.currentInnings - 1);
    const [activeBatsman, setActiveBatsman] = useState('full');
    const [isExporting, setIsExporting] = useState(false);
    const [exportStatus, setExportStatus] = useState(null); // 'success', 'error', 'generating'
    const [editingBall, setEditingBall] = useState(null);

    const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"],
            v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    useLayoutEffect(() => {
        window.scrollTo(0, 0);
        if (searchParams.get('export') === 'true') {
            const timer = setTimeout(exportPDF, 1500);
            return () => clearTimeout(timer);
        }
    }, [searchParams]);

    const handleNameClick = (name, type = 'player', teamIndex, role, innIndex, overNum, ballIndex) => {
        setEditInfo({ oldName: name, newName: name, type, teamIndex, role, innIndex, overNum, ballIndex });
    };

    const confirmRename = () => {
        if (editInfo && editInfo.newName.trim() && editInfo.newName !== editInfo.oldName) {
            if (editInfo.type === 'team') {
                const oldNameLower = editInfo.oldName.trim().toLowerCase();
                const t1Lower = state.team1.name?.trim().toLowerCase();
                const t2Lower = state.team2.name?.trim().toLowerCase();
                const newNameLower = editInfo.newName.trim().toLowerCase();
                // Only enforce uniqueness if we're renaming an ACTIVE team (not fixing stale innings data)
                const isActiveTeam = oldNameLower === t1Lower || oldNameLower === t2Lower;
                if (isActiveTeam) {
                    const otherTeam = (oldNameLower === t1Lower) ? state.team2.name : state.team1.name;
                    if (newNameLower === otherTeam?.toLowerCase()) {
                        // New name matches the OTHER team → fix innings data only, don't rename actual team records
                        dispatch({
                            type: 'RENAME_TEAM',
                            payload: {
                                oldName: editInfo.oldName,
                                newName: editInfo.newName,
                                teamIndex: editInfo.teamIndex,
                                innIndex: editInfo.innIndex, // limit to only this innings
                                fixInningsOnly: true
                            }
                        });
                        setEditInfo(null);
                        return;
                    }
                }
            }

            // DUPLICATE PLAYER CHECK: Only block if newName already exists as a DIFFERENT player
            // in the SAME innings and SAME role (batsman/bowler).
            // A bowler in innings 1 = batsman in innings 2 (same person), so don't cross-check.
            if (editInfo.type === 'player' && editInfo.innIndex != null && editInfo.role) {
                const newNameLower = editInfo.newName.trim().toLowerCase();
                const oldNameLower = editInfo.oldName.trim().toLowerCase();
                const inn = state.innings[editInfo.innIndex];

                if (inn) {
                    const listToCheck = editInfo.role === 'bowler' ? (inn.bowlers || []) : (inn.batsmen || []);
                    const duplicate = listToCheck.find(
                        p => p.name?.trim().toLowerCase() === newNameLower && p.name?.trim().toLowerCase() !== oldNameLower
                    );
                    if (duplicate && editInfo.role !== 'bowler') {
                        alert(`A different batsman named "${editInfo.newName.trim()}" already exists in this innings!`);
                        return;
                    }
                }
            }

            dispatch({
                type: editInfo.type === 'team' ? 'RENAME_TEAM' : 'RENAME_PLAYER',
                payload: {
                    oldName: editInfo.oldName,
                    newName: editInfo.newName,
                    teamIndex: editInfo.teamIndex,
                    role: editInfo.role,
                    innIndex: editInfo.innIndex,
                    overNum: editInfo.overNum,
                    ballIndex: editInfo.ballIndex
                }
            });
        }
        setEditInfo(null);
    };


    const exportPDF = async () => {
        if (isExporting) return;
        setIsExporting(true);
        setExportStatus('generating');

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const W = 210; // A4 width mm
            const margin = 14;
            const colW = W - margin * 2;
            let y = 0;

            // ─── helpers ────────────────────────────────────────────────
            const hex = (h) => {
                const r = parseInt(h.slice(1, 3), 16) / 255;
                const g = parseInt(h.slice(3, 5), 16) / 255;
                const b = parseInt(h.slice(5, 7), 16) / 255;
                return [r * 255, g * 255, b * 255];
            };
            const setFill = (color) => pdf.setFillColor(...hex(color));
            const setTextColor = (color) => pdf.setTextColor(...hex(color));
            const checkPage = (needed = 20) => {
                if (y + needed > 280) { pdf.addPage(); y = 16; }
            };

            // ─── HEADER BANNER ──────────────────────────────────────────
            setFill('#1e1b4b');
            pdf.rect(0, 0, W, 28, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            setTextColor('#ffffff');
            pdf.text(`${state.team1?.name}  v  ${state.team2?.name}`, W / 2, 12, { align: 'center' });
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            const dateStr = state.matchDate ? new Date(state.matchDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const totalOvers = state.totalOvers || state.overs || state.matchOvers || '';
            pdf.text(`${totalOvers ? totalOvers + ' overs  •  ' : ''}${dateStr}  •  CricScorer Pro`, W / 2, 21, { align: 'center' });
            y = 34;

            // ─── INNINGS SECTIONS ────────────────────────────────────────
            const innLabels = ['1st Innings', '2nd Innings', 'Super Over 1st', 'Super Over 2nd'];

            (state.innings || []).forEach((inn, innIdx) => {
                if (!inn) return;
                checkPage(40);

                // Innings header bar — matching table width (within margins)
                setFill('#4338ca');
                pdf.rect(margin, y, colW, 11, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(11);
                setTextColor('#ffffff');
                const innScore = `${inn.runs ?? 0}-${inn.wickets ?? 0}  (${inn.overs ?? 0} ov)`;
                pdf.text(`${inn.battingTeam || ''}  •  ${innLabels[innIdx] || ''}`, margin + 4, y + 7.5);
                pdf.text(innScore, margin + colW - 5, y + 7.5, { align: 'right' });
                y += 14;

                // ── BATSMEN TABLE — Recalculated for full colW (182mm) and aligned stats ──
                const batCols = [
                    { label: 'Batsman', x: margin, w: 80, align: 'left' },
                    { label: 'R', x: margin + 80, w: 20, align: 'center' },
                    { label: 'B', x: margin + 100, w: 20, align: 'center' },
                    { label: '4s', x: margin + 120, w: 18, align: 'center' },
                    { label: '6s', x: margin + 138, w: 18, align: 'center' },
                    { label: 'SR', x: margin + 156, w: 26, align: 'center' }
                ];

                setFill('#eef2ff');
                pdf.rect(margin, y, colW, 8, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                setTextColor('#4338ca');
                batCols.forEach(c => pdf.text(c.label, c.align === 'left' ? c.x + 2 : c.x + c.w / 2, y + 5.5, { align: c.align }));
                y += 8;

                (inn.batsmen || []).forEach((b, i) => {
                    checkPage(12);
                    if (i % 2 === 0) { setFill('#f8fafc'); pdf.rect(margin, y, colW, 11, 'F'); }
                    setTextColor('#1e1b4b');
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text((b.name || '').toUpperCase().slice(0, 20), margin + 2, y + 5);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(8);
                    setTextColor('#64748b');
                    let dText = b.dismissalText;
                    if (!dText && b.isOut) {
                        dText = getFallbackDismissalText(b, inn.timeline) || (b.dismissalType ? `Out (${b.dismissalType})` : 'Out');
                    } else if (!dText) {
                        dText = 'Not Out';
                    }
                    pdf.text(dText.slice(0, 40), margin + 2, y + 9);
                    setTextColor('#1e1b4b');
                    pdf.setFontSize(9.5);
                    const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0';
                    [b.runs, b.balls, b.fours, b.sixes, sr].forEach((v, vi) => {
                        const c = batCols[vi + 1];
                        pdf.text(String(v ?? 0), c.x + c.w / 2, y + 6.5, { align: 'center' });
                    });
                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(margin, y + 11, margin + colW, y + 11);
                    y += 11;
                });

                checkPage(8);
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(8.5);
                setTextColor('#64748b');
                pdf.text(`Extras: Wides ${inn.extras?.wides ?? 0}, No Balls ${inn.extras?.noBalls ?? 0}, Byes ${inn.extras?.byes ?? 0}, Leg Byes ${inn.extras?.legByes ?? 0}`, margin + 2, y + 5.5);
                y += 9;

                checkPage(20);
                const bowlCols = [
                    { label: 'Bowler', x: margin, w: 80, align: 'left' },
                    { label: 'O', x: margin + 80, w: 20, align: 'center' },
                    { label: 'M', x: margin + 100, w: 18, align: 'center' },
                    { label: 'R', x: margin + 118, w: 18, align: 'center' },
                    { label: 'W', x: margin + 136, w: 18, align: 'center' },
                    { label: 'ER', x: margin + 154, w: 28, align: 'center' }
                ];

                setFill('#eef2ff');
                pdf.rect(margin, y, colW, 8, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(9);
                setTextColor('#4338ca');
                bowlCols.forEach(c => pdf.text(c.label, c.align === 'left' ? c.x + 2 : c.x + c.w / 2, y + 5.5, { align: c.align }));
                y += 8;

                const bowlerMap = {};
                (inn.bowlers || []).forEach(b => {
                    const key = (b.name || 'Unknown').trim().toUpperCase();
                    if (!bowlerMap[key]) bowlerMap[key] = { name: key, balls: 0, maidens: 0, runs: 0, wickets: 0 };
                    const balls = Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10);
                    bowlerMap[key].balls += balls;
                    bowlerMap[key].maidens += b.maidens || 0;
                    bowlerMap[key].runs += b.runs || 0;
                    bowlerMap[key].wickets += b.wickets || 0;
                });

                Object.values(bowlerMap).forEach((b, i) => {
                    checkPage(9);
                    if (i % 2 === 0) { setFill('#f8fafc'); pdf.rect(margin, y, colW, 9, 'F'); }
                    const displayOvers = Math.floor(b.balls / 6) + (b.balls % 6) / 10;
                    const er = b.balls > 0 ? (b.runs / (b.balls / 6)).toFixed(2) : '0.00';
                    setTextColor('#1e1b4b');
                    pdf.setFontSize(10);
                    pdf.setFont('helvetica', 'bold');
                    pdf.text(b.name.slice(0, 20), margin + 2, y + 6);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9.5);
                    [displayOvers, b.maidens, b.runs, b.wickets, er].forEach((v, vi) => {
                        const c = bowlCols[vi + 1];
                        pdf.text(String(v), c.x + c.w / 2, y + 6, { align: 'center' });
                    });
                    pdf.setDrawColor(226, 232, 240);
                    pdf.line(margin, y + 9, margin + colW, y + 9);
                    y += 9;
                });
                y += 7;
            });

            // ─── MAN OF THE MATCH ────────────────────────────────────────
            if (state.manOfMatch?.name) {
                checkPage(18);
                setFill('#fef3c7');
                pdf.rect(margin, y, colW, 14, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                setTextColor('#92400e');
                pdf.text('MAN OF THE MATCH', margin + 4, y + 5);
                pdf.setFontSize(11);
                setTextColor('#1e1b4b');
                pdf.text(state.manOfMatch.name, margin + 4, y + 12);
                y += 18;
            }

            // ─── FOOTER ──────────────────────────────────────────────────
            setFill('#1e1b4b');
            pdf.rect(0, 285, W, 12, 'F');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            setTextColor('#a5b4fc');
            pdf.text('Generated by CricScorer Pro', W / 2, 292, { align: 'center' });

            const fileName = `Scorecard_${state.team1?.name}_vs_${state.team2?.name}.pdf`;

            // On Android/iOS use Capacitor Filesystem → Share sheet (saves to Downloads)
            if (Capacitor.isNativePlatform()) {
                const base64 = pdf.output('datauristring').split(',')[1];
                const savedFile = await Filesystem.writeFile({
                    path: fileName,
                    data: base64,
                    directory: Directory.Cache,
                });
                await Share.share({
                    title: fileName,
                    url: savedFile.uri,
                    dialogTitle: 'Save Scorecard PDF',
                });
            } else {
                // Web browser fallback
                pdf.save(fileName);
            }

            setExportStatus('success');
            setTimeout(() => setExportStatus(null), 3000);
            return { pdf, fileName };
        } catch (err) {
            console.error('PDF Export failed:', err);
            setExportStatus('error');
            setTimeout(() => setExportStatus(null), 5000);
            return null;
        } finally {
            setIsExporting(false);
        }
    };

    const handleShare = async () => {
        const res = await exportPDF();
        if (!res) return;

        // If on native platform, sharing was already handled by exportPDF
        if (Capacitor.isNativePlatform()) return;

        // Web sharing fallback
        if (navigator.canShare && navigator.canShare({ files: [new File([], 'a.pdf', { type: 'application/pdf' })] })) {
            try {
                const blob = res.pdf.output('blob');
                const file = new File([blob], res.fileName, { type: 'application/pdf' });
                await navigator.share({
                    files: [file],
                    title: 'Match Scorecard',
                    text: `Final Scorecard: ${state.team1?.name} vs ${state.team2?.name}`
                });
            } catch (err) {
                console.error('Web share failed:', err);
            }
        } else {
            alert("Scorecard PDF generated! Please check your downloads folder to share it manually.");
        }
    };

    const getFallbackDismissalText = (b, timeline) => {
        if (!timeline) return null;
        const wktBall = timeline.find(t => t.isWicket && t.batsmanName === b.name);
        if (!wktBall) return null;
        
        const bowler = wktBall.bowlerName;
        const type = wktBall.wicketType || b.dismissalType;
        const fielder = wktBall.fielderName || b.fielderName;

        if (!type) return null;

        switch(type) {
            case 'bowled': return `b ${bowler}`;
            case 'caught': return fielder ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`;
            case 'lbw': return `lbw b ${bowler}`;
            case 'runout':
            case 'run out': return fielder ? `run out (${fielder})` : `run out`;
            case 'stumped': return fielder ? `st ${fielder} b ${bowler}` : `st b ${bowler}`;
            case 'hit wicket': return `hit wicket b ${bowler}`;
            case 'mankad': return `run out (mankad) ${bowler}`;
            default: return `Out (${type})`;
        }
    };

    const TeamSection = ({ inn, teamName, innNum }) => {
        // Exact-match only: resolve canonical team name from state
        // (never use startsWith — "BIKASH THAKUR".startsWith("BIKASH") = true, causes wrong match)
        const resolvedName = (() => {
            const t1 = state.team1?.name?.trim().toLowerCase();
            const t2 = state.team2?.name?.trim().toLowerCase();
            const batting = (teamName || '').trim().toLowerCase();
            if (t1 === batting) return state.team1.name;
            if (t2 === batting) return state.team2.name;
            return teamName; // pass raw — RENAME_TEAM still updates innings row
        })();

        return (
            <div style={{ marginBottom: '32px' }}>
                <div style={{
                    background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
                    color: 'white',
                    padding: '16px 24px', // Increased padding
                    borderRadius: '16px 16px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 4px 12px rgba(67, 56, 202, 0.2)'
                }}>
                    <span
                        onClick={() => handleNameClick(resolvedName, 'team', state.team1.name === state.team2.name ? innNum : undefined, undefined, innNum - 1)}
                        style={{ fontWeight: '800', fontSize: '16px', letterSpacing: '0.5px', cursor: 'pointer', textDecoration: 'underline dotted 1px' }}
                    >
                        {teamName} • {innNum === 1 ? '1st' : innNum === 2 ? '2nd' : innNum === 3 ? 'Super Over 1st' : 'Super Over 2nd'} Innings
                    </span>
                    <span style={{ fontWeight: '900', fontSize: '18px' }}>{inn.runs}-{inn.wickets} ({inn.overs})</span>
                </div>
                <div className="card" style={{ borderRadius: '0 0 12px 12px', padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ backgroundColor: '#f3f4f6' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Batsman</th>
                                <th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inn.batsmen.map((b, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '8px 16px' }}>
                                        <div
                                            onClick={() => handleNameClick(b.name, 'player', undefined, 'batsman', innNum - 1)}
                                            style={{ cursor: 'pointer', fontWeight: '700', color: '#1e1b4b' }}
                                        >
                                            {b.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                                {b.isRetiredHurt ? (
                                                    b.isOut ? (
                                                        `Retired Hurt (${b.retiredHurtAt?.over}.${b.retiredHurtAt?.ball})`
                                                    ) : (
                                                        <span>
                                                            Returned{' '}
                                                            {b.returnedAt && `(${b.returnedAt.over}.${b.returnedAt.ball})`}
                                                            {' • Not Out'}
                                                        </span>
                                                    )
                                                ) : (
                                                    b.dismissalText || (b.isOut ? (getFallbackDismissalText(b, inn.timeline) || (b.dismissalType ? `Out (${b.dismissalType})` : 'Out')) : 'Not Out')
                                                )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{b.runs}</td>
                                    <td style={{ textAlign: 'center' }}>{b.balls}</td>
                                    <td style={{ textAlign: 'center' }}>{b.fours}</td>
                                    <td style={{ textAlign: 'center' }}>{b.sixes}</td>
                                    <td style={{ textAlign: 'center' }}>{b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', borderTop: '1px solid #f0f0f0' }}>
                        Extras: W:{inn.extras.wides} NB:{inn.extras.noBalls} B:{inn.extras.byes} LB:{inn.extras.legByes}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', borderTop: '1px solid #f0f0f0' }}>
                        <thead style={{ backgroundColor: '#f3f4f6' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Bowler</th>
                                <th>O</th><th>M</th><th>R</th><th>W</th><th>ER</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const aggregatedBowlers = [];
                                const bowlerMap = {};

                                inn.bowlers.forEach(b => {
                                    const rawName = (b.name || 'Unknown').trim();
                                    const key = rawName.toUpperCase(); // case-insensitive merge key
                                    if (!bowlerMap[key]) {
                                        bowlerMap[key] = {
                                            name: key, // always display as uppercase
                                            totalBalls: 0,
                                            maidens: 0,
                                            runs: 0,
                                            wickets: 0
                                        };
                                        aggregatedBowlers.push(key);
                                    }

                                    // Convert overs (like 1.3) to balls for accurate calculation
                                    const balls = Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10);
                                    bowlerMap[key].totalBalls += balls;
                                    bowlerMap[key].maidens += (b.maidens || 0);
                                    bowlerMap[key].runs += (b.runs || 0);
                                    bowlerMap[key].wickets += (b.wickets || 0);
                                });

                                return aggregatedBowlers.map(key => {
                                    const b = bowlerMap[key];
                                    const displayOvers = Math.floor(b.totalBalls / 6) + (b.totalBalls % 6) / 10;
                                    const economy = b.totalBalls > 0 ? (b.runs / (b.totalBalls / 6)).toFixed(2) : '0.00';

                                    return (
                                        <tr key={key}>
                                            <td
                                                style={{ padding: '8px 16px', cursor: 'pointer', color: '#1e1b4b', fontWeight: '600' }}
                                                onClick={() => handleNameClick(b.name, 'player', undefined, 'bowler', innNum - 1)}
                                            >
                                                {b.name}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{displayOvers}</td>
                                            <td style={{ textAlign: 'center' }}>{b.maidens}</td>
                                            <td style={{ textAlign: 'center' }}>{b.runs}</td>
                                            <td style={{ textAlign: 'center' }}>{b.wickets}</td>
                                            <td style={{ textAlign: 'center' }}>{economy}</td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

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
        <div style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
            <div className="header" style={{ justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 1000, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e2e8f0', height: '64px', padding: '0 16px' }}>
                <ChevronLeft onClick={() => navigate(-1)} style={{ cursor: 'pointer', color: '#1e1b4b' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontWeight: '800', fontSize: '15px', color: '#1e1b4b' }}>
                        {state.team1?.name} vs {state.team2?.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginTop: '2px' }}>
                        {formattedDate}{statusText ? ` • ${statusText}` : ''}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                    <div
                        onClick={exportPDF}
                        style={{ cursor: 'pointer', color: exportStatus === 'generating' ? '#4338ca' : '#1e1b4b', transition: '0.3s' }}
                    >
                        <Download size={22} />
                    </div>
                    <div
                        onClick={handleShare}
                        style={{ cursor: 'pointer', color: '#1e1b4b', transition: '0.3s' }}
                    >
                        <Share2 size={22} />
                    </div>
                </div>
            </div>

            <EditNameModal
                info={editInfo}
                onClose={() => setEditInfo(null)}
                onSave={confirmRename}
                onChange={(val) => setEditInfo(prev => ({ ...prev, newName: val }))}
            />

            {exportStatus && (
                <div style={{
                    position: 'fixed',
                    top: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: exportStatus === 'error' ? '#ef4444' : '#4338ca',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '30px',
                    fontSize: '13px',
                    fontWeight: '800',
                    zIndex: 2000,
                    boxShadow: '0 10px 25px rgba(67, 56, 202, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'liquidFadeIn 0.3s ease'
                }}>
                    {exportStatus === 'generating' && <div className="loader-small" style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>}
                    {exportStatus === 'success' && <CheckCircle2 size={18} />}
                    {exportStatus === 'error' && <AlertCircle size={18} />}
                    {exportStatus === 'generating' ? 'Generating PDF...' : exportStatus === 'success' ? 'Scorecard Saved!' : 'Generation Failed!'}
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>

            <div style={{ display: 'flex', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0' }}>
                {['scoreboard', 'overs', 'wagonwheel']?.map(tab => (
                    <div
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            flex: 1, textAlign: 'center', padding: '14px 0', fontSize: '13px', fontWeight: '800',
                            color: activeTab === tab ? '#4338ca' : '#94a3b8',
                            borderBottom: activeTab === tab ? '3px solid #4338ca' : '3px solid transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {tab === 'wagonwheel' ? (
                            <img src={wagonWheelIcon} alt="" style={{ width: '16px', height: '16px', opacity: activeTab === tab ? 1 : 0.6 }} />
                        ) : tab === 'scoreboard' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        )}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </div>
                ))}
            </div>

            <div className="container" id="scorecard-content" style={{ backgroundColor: 'white', padding: activeTab === 'overs' ? '12px 16px' : '24px' }}>
                {/* Scorecard Sections */}
                {activeTab === 'scoreboard' && (
                    <div className="animate-fade-in">
                        {state.innings.slice(0, state.currentInnings).map((inn, idx) => (
                            <TeamSection key={idx} inn={inn} teamName={inn?.battingTeam || `Team ${idx + 1}`} innNum={idx + 1} />
                        ))}
                    </div>
                )}

                {activeTab === 'overs' && (
                    <div className="animate-fade-in">
                        <OverByOverChart
                            innings={state.innings}
                            team1Name={state.team1?.name}
                            team2Name={state.team2?.name}
                            totalOvers={state.matchSettings?.overs}
                        />

                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '16px',
                            overflowX: 'auto',
                            paddingBottom: '4px',
                            scrollbarWidth: 'none'
                        }}>
                            {state.innings.slice(0, state.currentInnings).map((inn, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedInnIdx(idx)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: '800',
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer',
                                        transition: '0.3s',
                                        backgroundColor: selectedInnIdx === idx ? '#4338ca' : '#f1f5f9',
                                        color: selectedInnIdx === idx ? 'white' : '#64748b',
                                        border: `1px solid ${selectedInnIdx === idx ? '#4338ca' : '#e2e8f0'}`,
                                        boxShadow: selectedInnIdx === idx ? '0 4px 12px rgba(67, 56, 202, 0.2)' : 'none'
                                    }}
                                >
                                    {inn.battingTeam} ({idx + 1}{idx === 0 ? 'st' : idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th'} Inn)
                                </div>
                            ))}
                        </div>

                        {(() => {
                            const inn = state.innings[selectedInnIdx];
                            if (!inn || inn.balls === 0) return (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                    No overs recorded for this inning yet.
                                </div>
                            );

                            // Group timeline into overs
                            const overs = [];
                            let currentOver = { num: 1, bowler: '', balls: [], runs: 0, totalAtEnd: 0, wicketsAtEnd: 0, startTime: null, duration: 0 };
                            let runningTotal = 0;
                            let runningWickets = 0;

                            const batsmanRunningScores = {};
                            (inn.timeline || []).forEach((ball, idx) => {
                                if (!currentOver.startTime && ball.timestamp) currentOver.startTime = ball.timestamp;
                                const ballRuns = ((ball.runs || 0) + (ball.extras || 0));
                                
                                const batsman = ball.batsmanName;
                                if (batsman && batsmanRunningScores[batsman] === undefined) {
                                    batsmanRunningScores[batsman] = 0;
                                }
                                const scoreAtBall = batsman ? batsmanRunningScores[batsman] : 0;

                                currentOver.balls.push({ ...ball, timelineIdx: idx, batsmanRunsAtBall: scoreAtBall });
                                currentOver.runs += ballRuns;
                                runningTotal += ballRuns;
                                if (ball.isWicket) runningWickets += 1;
                                if (!currentOver.bowler) currentOver.bowler = ball.bowlerName;

                                if (batsman && !ball.isWide && !ball.isBye && !ball.isLegBye) {
                                    batsmanRunningScores[batsman] += (ball.runs || 0);
                                }

                                // A legal over ends at 6 legal balls
                                const legalBalls = currentOver.balls.filter(b => !b.isWide && !b.isNoBall).length;
                                if (legalBalls === 6 || idx === (inn.timeline?.length || 0) - 1) {
                                    if (currentOver.startTime && ball.timestamp) {
                                        currentOver.duration = Math.round((ball.timestamp - currentOver.startTime) / 1000);
                                    }
                                    currentOver.totalAtEnd = runningTotal;
                                    currentOver.wicketsAtEnd = runningWickets;
                                    overs.push(currentOver);
                                    currentOver = { num: overs.length + 1, bowler: '', balls: [], runs: 0, totalAtEnd: 0, wicketsAtEnd: 0, startTime: null, duration: 0 };
                                }
                            });

                            return (
                                <div className="animate-fade-in">
                                    <h3 style={{ fontSize: '13px', color: '#4338ca', marginBottom: '16px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4338ca' }}></div>
                                        {inn?.battingTeam} — {inn?.runs || 0}/{inn?.wickets || 0} ({inn?.overs || '0.0'} ov)
                                    </h3>
                                    {[...overs].reverse().map((ov, oIdx) => (
                                        <div key={oIdx} className="card" style={{ padding: '12px', marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                            <div
                                                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', cursor: 'pointer' }}
                                                onClick={() => {
                                                    const key = `${selectedInnIdx}-${ov.num}`;
                                                    setExpandedOvers(prev => ({ ...prev, [key]: !prev[key] }));
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#1e1b4b', fontSize: '14px' }}>{getOrdinal(ov.num)} Over</span>
                                                    <span
                                                        onClick={(e) => { e.stopPropagation(); handleNameClick(ov.bowler, 'player', undefined, 'bowler', selectedInnIdx, ov.num) }}
                                                        style={{ color: '#64748b', fontWeight: '600', cursor: 'pointer', borderBottom: '1px dotted #cbd5e1' }}
                                                    >
                                                        {ov.bowler || 'Unknown'}
                                                    </span>
                                                    {ov.startTime && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px', fontWeight: '700' }}>
                                                                <Clock size={12} />
                                                                {new Date(ov.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                            <div style={{ padding: '2px 8px', backgroundColor: '#f1f5f9', borderRadius: '6px', fontSize: '11px', fontWeight: '800', color: '#475569' }}>
                                                                {ov.duration >= 60 ? `${Math.floor(ov.duration / 60)}m ${ov.duration % 60}s` : `${ov.duration}s`}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '13px' }}>{ov.runs} Runs</span>
                                                    <ChevronDown size={16} style={{ transform: expandedOvers[`${selectedInnIdx}-${ov.num}`] ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s', color: '#94a3b8' }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {ov.balls.map((b, bIdx) => {
                                                        let bgColor = 'white';
                                                        let textColor = '#1f2937';
                                                        let borderColor = '#e2e8f0';

                                                        if (b.isWicket) {
                                                            bgColor = '#ef4444';
                                                            textColor = 'white';
                                                            borderColor = '#ef4444';
                                                        } else if (b.runs === 4) {
                                                            bgColor = '#2563eb';
                                                            textColor = 'white';
                                                            borderColor = '#2563eb';
                                                        } else if (b.runs === 6) {
                                                            bgColor = '#16a34a';
                                                            textColor = 'white';
                                                            borderColor = '#16a34a';
                                                        }

                                                        return (
                                                            <div key={bIdx} style={{
                                                                width: '32px', height: '32px', borderRadius: '50%', border: `1.5px solid ${borderColor}`,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
                                                                backgroundColor: bgColor,
                                                                color: textColor,
                                                                fontWeight: (b.isWicket || b.runs >= 4) ? 'bold' : 'normal'
                                                            }}>
                                                                {b.isWicket ? 'W' : (b.isWide ? 'Wd' : (b.isNoBall ? 'Nb' : b.runs || 0))}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <span style={{ fontSize: '15px', fontWeight: '900', color: '#4338ca', background: '#f5f3ff', padding: '2px 8px', borderRadius: '6px', minWidth: '60px', textAlign: 'center', marginLeft: '12px' }}>{ov.totalAtEnd}-{ov.wicketsAtEnd}</span>
                                            </div>
                                            {expandedOvers[`${selectedInnIdx}-${ov.num}`] && (
                                                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {ov.balls.map((b, bIdx) => {
                                                        let action = b.isWicket ? 'Wicket 🔴' : (b.isWide ? 'Wide ⚾' : (b.isNoBall ? 'No Ball 🚫' : `${b.runs} Runs`));
                                                        if (b.droppedCatch) {
                                                            action = `${b.runs} Runs (Drop by ${b.droppedCatch.fielderName}) 🤲❌`;
                                                        }
                                                        if (b.isWicket) {
                                                            let dText = b.dismissalText;
                                                            if (!dText && b.batsmanName) {
                                                                const outBat = inn.batsmen?.find(bat => bat.name === b.batsmanName);
                                                                if (outBat && outBat.dismissalText) dText = outBat.dismissalText;
                                                            }
                                                            if (dText) {
                                                                // Remove redundant " b BowlerName" since bowler is already shown on the left
                                                                if (dText.includes('c & b')) {
                                                                    dText = 'c & b';
                                                                } else {
                                                                    const bIndex = dText.lastIndexOf(' b ');
                                                                    if (bIndex !== -1) {
                                                                        dText = dText.substring(0, bIndex);
                                                                    }
                                                                }
                                                                action = `Wicket (${dText}) 🔴`;
                                                            }
                                                        }
                                                        
                                                        const zone = b.zone || b.wagonZone;
                                                        if (zone && !b.isWide && !b.isNoBall && !b.isWicket) {
                                                            action += ` to ${zone}`;
                                                        }
                                                        return (
                                                            <div key={bIdx} style={{ fontSize: '12px', color: '#4b5563', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #f1f5f9' }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: b.isWicket ? '#ef4444' : (b.runs >= 4 ? '#3b82f6' : '#64748b') }}></span>
                                                                <span
                                                                    style={{ fontWeight: '600', color: '#1e1b4b', cursor: 'pointer', textDecoration: 'underline dotted 1px' }}
                                                                    onClick={(e) => { e.stopPropagation(); handleNameClick(b.bowlerName, 'player', undefined, 'bowler', selectedInnIdx, ov.num, bIdx); }}
                                                                >
                                                                    {b.bowlerName}
                                                                </span>
                                                                <span style={{ color: '#94a3b8' }}>to</span>
                                                                <span
                                                                    style={{ fontWeight: '600', color: '#1e1b4b', cursor: 'pointer', textDecoration: 'underline dotted 1px' }}
                                                                    onClick={(e) => { e.stopPropagation(); handleNameClick(b.batsmanName, 'player', undefined, 'batsman', selectedInnIdx, ov.num, bIdx); }}
                                                                >
                                                                    {b.batsmanName}
                                                                </span>
                                                                {b.droppedCatch && (
                                                                    <span style={{ fontSize: '11px', fontWeight: '800', color: '#e94560', marginLeft: '4px' }}>
                                                                        (Dropped on {b.batsmanRunsAtBall || 0} Runs)
                                                                    </span>
                                                                )}
                                                                <span 
                                                                    onClick={() => {
                                                                        if (!b.isWicket && !b.isWide && !b.isNoBall && !b.isBye && !b.isLegBye) {
                                                                            setEditingBall({ innIdx: selectedInnIdx, timelineIdx: b.timelineIdx, currentRuns: b.runs, ...b });
                                                                        }
                                                                    }}
                                                                    style={{ 
                                                                        marginLeft: 'auto', backgroundColor: 'white', padding: '2px 8px', 
                                                                        borderRadius: '6px', fontSize: '11px', fontWeight: '800', 
                                                                        border: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                                                                        cursor: (!b.isWicket && !b.isWide && !b.isNoBall && !b.isBye && !b.isLegBye) ? 'pointer' : 'default',
                                                                        boxShadow: (!b.isWicket && !b.isWide && !b.isNoBall && !b.isBye && !b.isLegBye) ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                                                    }}
                                                                >
                                                                    {action}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {activeTab === 'wagonwheel' && <WagonWheelTab state={state} />}

                {state.matchStatus === 'complete' && state.manOfMatch?.name && (
                    <div className="card animate-fade-in" style={{ padding: '0', overflow: 'hidden', marginTop: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.3)' }}>
                        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'white', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '20px', flexShrink: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                                {state.manOfMatch.name.charAt(0)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9, marginBottom: '2px' }}>⭐ Man of the Match</div>
                                <div style={{ fontSize: '18px', fontWeight: '900', lineHeight: 1.2 }}>{state.manOfMatch.name}</div>
                                <div style={{ fontSize: '12px', fontWeight: '600', opacity: 0.9, marginTop: '4px' }}>
                                    {state.manOfMatch.batting?.runs || 0} runs • {state.manOfMatch.bowling?.wickets || 0} wkts • {state.manOfMatch.fielding?.catches || 0} catches
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {editingBall && (
                <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-scale-in" style={{ backgroundColor: 'white', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#1e1b4b', marginBottom: '8px' }}>Edit Score</h3>
                        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
                            <strong style={{ color: '#1e1b4b' }}>{editingBall.bowlerName}</strong> to <strong style={{ color: '#1e1b4b' }}>{editingBall.batsmanName}</strong>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                            {[0, 1, 2, 3, 4, 6].map(r => (
                                <button 
                                    key={r}
                                    onClick={() => {
                                        dispatch({ 
                                            type: 'EDIT_TIMELINE_BALL', 
                                            payload: { innIdx: editingBall.innIdx, timelineIdx: editingBall.timelineIdx, newRuns: r }
                                        });
                                        setEditingBall(null);
                                    }}
                                    style={{
                                        padding: '16px 0', borderRadius: '16px', border: '2px solid transparent', 
                                        backgroundColor: editingBall.currentRuns === r ? '#4338ca' : '#f1f5f9',
                                        color: editingBall.currentRuns === r ? 'white' : '#1e1b4b',
                                        fontWeight: '900', fontSize: '20px', cursor: 'pointer',
                                        transition: '0.2s',
                                        boxShadow: editingBall.currentRuns === r ? '0 8px 16px rgba(67, 56, 202, 0.3)' : 'none'
                                    }}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => setEditingBall(null)} 
                            style={{ width: '100%', padding: '14px', borderRadius: '16px', backgroundColor: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: '800', fontSize: '15px', cursor: 'pointer', transition: '0.2s' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

const WagonWheelTab = ({ state }) => {
    const [innFilter, setInnFilter] = useState('both'); // '1', '2', 'both'
    const [batFilter, setBatFilter] = useState('all');
    const [bowlFilter, setBowlFilter] = useState('all');
    const [runsFilter, setRunsFilter] = useState([0, 1, 2, 3, 4, 6]);

    const zoneMap = {
        'Third Man': { x: 225, y: 225 },
        'Point': { x: 270, y: 150 },
        'Cover': { x: 225, y: 75 },
        'Long Off': { x: 175, y: 30 },
        'Long On': { x: 125, y: 30 },
        'Mid Wicket': { x: 75, y: 75 },
        'Square Leg': { x: 30, y: 150 },
        'Fine Leg': { x: 75, y: 225 }
    };

    const runColors = {
        0: '#94a3b8',
        1: '#f97316',
        2: '#ec4899',
        3: '#14b8a6',
        4: '#3b82f6',
        6: '#ef4444'
    };

    const wagonBalls = useMemo(() => {
        let balls = [];
        state.innings.forEach((inn, idx) => {
            if (inn && (innFilter === 'both' || inn.battingTeam === innFilter)) {
                const innBalls = (inn.timeline || []).map(b => ({
                    ...b,
                    innNum: idx + 1,
                    zone: b.zone || b.wagonZone
                }));
                balls.push(...innBalls);
            }
        });

        return balls.filter(ball => {
            const hasZone = !!ball.zone;
            const matchesBat = batFilter === 'all' || ball.batsmanName === batFilter;
            const matchesBowl = bowlFilter === 'all' || ball.bowlerName === bowlFilter;
            const matchesRuns = runsFilter.includes(ball.runs || 0);
            const isLegal = !ball.isWide && !ball.isBye;

            return hasZone && isLegal && matchesBat && matchesBowl && matchesRuns;
        });
    }, [state.innings, innFilter, batFilter, bowlFilter, runsFilter]);

    const uniqueBatsmen = useMemo(() => {
        const names = new Set();
        state.innings.forEach(inn => {
            if (inn && (innFilter === 'both' || inn.battingTeam === innFilter)) {
                (inn.timeline || []).forEach(b => {
                    if (b.batsmanName) names.add(b.batsmanName);
                });
            }
        });
        return Array.from(names).sort();
    }, [state.innings, innFilter]);

    const uniqueBowlers = useMemo(() => {
        const names = new Set();
        state.innings.forEach(inn => {
            if (inn && (innFilter === 'both' || inn.battingTeam === innFilter)) {
                (inn.timeline || []).forEach(b => {
                    if (b.bowlerName) names.add(b.bowlerName);
                });
            }
        });
        return Array.from(names).sort();
    }, [state.innings, innFilter]);

    const zoneStats = useMemo(() => {
        const stats = {};
        Object.keys(zoneMap).forEach(z => stats[z] = { runs: 0, count: 0, percentage: 0 });
        const totalRuns = wagonBalls.reduce((sum, b) => sum + (b.runs || 0), 0);

        wagonBalls.forEach(b => {
            if (stats[b.zone]) {
                stats[b.zone].runs += (b.runs || 0);
                stats[b.zone].count += 1;
            }
        });

        if (totalRuns > 0) {
            Object.keys(stats).forEach(z => {
                stats[z].percentage = Math.round((stats[z].runs / totalRuns) * 100);
            });
        }
        return stats;
    }, [wagonBalls]);

    const strongZone = Object.keys(zoneStats).reduce((a, b) => zoneStats[a].percentage > zoneStats[b].percentage ? a : b, Object.keys(zoneMap)[0]);
    const weakZone = Object.keys(zoneStats).find(z => zoneStats[z].percentage === 0) || null;

    const statsBar = useMemo(() => {
        const total = wagonBalls.length;
        if (total === 0) return null;
        const runs = wagonBalls.reduce((sum, b) => sum + (b.runs || 0), 0);
        const boundaries = wagonBalls.filter(b => b.runs === 4 || b.runs === 6).length;
        const dots = wagonBalls.filter(b => b.runs === 0).length;

        return {
            bdryPct: ((boundaries / total) * 100).toFixed(1),
            bdryFreq: (total / (boundaries || 1)).toFixed(1),
            dots,
            dotPct: ((dots / total) * 100).toFixed(1),
            dotFreq: (total / (dots || 1)).toFixed(1),
            sr: ((runs / total) * 100).toFixed(1)
        };
    }, [wagonBalls]);

    const toggleRun = (r) => {
        setRunsFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {wagonBalls.length === 0 && batFilter === 'all' && bowlFilter === 'all' && innFilter === 'both' && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '12px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                    <h3 style={{ color: '#1f2937', marginBottom: '4px', fontSize: '16px' }}>No wagon wheel data yet</h3>
                    <p style={{ fontSize: '12px' }}>Recorded shots with zones will appear here.</p>
                    <div style={{ fontSize: '11px', marginTop: '10px', color: '#9ca3af' }}>
                        Total balls in timeline: {state.innings.reduce((sum, inn) => sum + (inn?.timeline?.length || 0), 0)}
                    </div>
                </div>
            )}
            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
                {['both', state.team1.name, state.team2.name].map(val => (
                    <button
                        key={val}
                        onClick={() => setInnFilter(val)}
                        style={{
                            padding: '4px 16px', borderRadius: '12px', fontSize: '12px', whiteSpace: 'nowrap',
                            backgroundColor: innFilter === val ? '#2D7A3D' : '#f3f4f6',
                            color: innFilter === val ? 'white' : '#4b5563', border: 'none', height: '28px'
                        }}
                    >
                        {val === 'both' ? 'Both Teams' : val}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <select value={batFilter} onChange={e => setBatFilter(e.target.value)} style={{ flex: 1, fontSize: '12px', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <option value="all">All Batsmen</option>
                    {uniqueBatsmen.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={bowlFilter} onChange={e => setBowlFilter(e.target.value)} style={{ flex: 1, fontSize: '12px', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <option value="all">All Bowlers</option>
                    {uniqueBowlers.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </div>

            {/* Run Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {[0, 1, 2, 3, 4, 6].map(r => {
                    const count = wagonBalls.filter(b => b.runs === r).length;
                    const active = runsFilter.includes(r);
                    return (
                        <div
                            key={r}
                            onClick={() => toggleRun(r)}
                            style={{
                                padding: '4px 16px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
                                backgroundColor: active ? runColors[r] : '#f3f4f6',
                                color: active ? 'white' : '#94a3b8',
                                display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid',
                                height: '28px',
                                borderColor: active ? runColors[r] : '#e2e8f0'
                            }}
                        >
                            <span style={{ fontWeight: 'bold' }}>{r}s</span>
                            <span style={{ opacity: 0.8 }}>{count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Stats Bar */}
            {statsBar && (
                <div className="card" style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>BDRY%</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.bdryPct}%</div></div>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>BDRY Freq</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.bdryFreq}</div></div>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>Dot Balls</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.dots}</div></div>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>DB%</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.dotPct}%</div></div>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>DB Freq</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.dotFreq}</div></div>
                        <div><div style={{ fontSize: '10px', color: '#64748b' }}>Strike Rate</div><div style={{ fontWeight: 'bold', color: '#1e293b' }}>{statsBar.sr}</div></div>
                    </div>
                </div>
            )}

            {/* Wagon Wheel SVG */}
            <div className="card" style={{ padding: '24px', backgroundColor: '#111827', color: 'white', borderRadius: '24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <WagonWheelVisuals shots={wagonBalls} />

                {wagonBalls.length > 0 && (
                    <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '11px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
                            <span style={{ color: '#94a3b8' }}>Strong: <span style={{ color: 'white', fontWeight: 'bold' }}>{strongZone}</span></span>
                        </div>
                        {weakZone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }}></div>
                                <span style={{ color: '#94a3b8' }}>Weak Area</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scorecard;
