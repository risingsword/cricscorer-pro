const fs = require('fs');
const path = 'c:\\Users\\sshiv\\.gemini\\antigravity\\scratch\\gullycric\\src\\context\\MatchContext.jsx';
let content = fs.readFileSync(path, 'utf8');

// The broken case starts with case 'RENAME_TEAM': { ... } then some messy lines
// I will find the end of RENAME_TEAM and replace until the end of the broken RENAME_PLAYER

const renamePlayerStartMatch = content.indexOf("case 'RENAME_PLAYER': {");
const renameTeamEndMatch = content.indexOf("return validateMatchState(evaluateMatchStatus(newState));", content.indexOf("case 'RENAME_TEAM'"));
const caseEndMatch = content.lastIndexOf("return finalState;"); // The return finalState of the broken rename player

// Actually, I'll just use a regex to identity the whole block and replace it.
// The block I want to fix is between line ~857 and ~981 in the current view.

const startMarker = "return validateMatchState(evaluateMatchStatus(newState));\n            }\n\n            const target = oldName.trim();";
const endMarker = "return finalState;\n        }";

const newBlock = `return validateMatchState(evaluateMatchStatus(newState));
        }

        case 'RENAME_PLAYER': {
            const { oldName, newName } = action.payload;
            if (!oldName || !newName) return state;

            const target = oldName.trim();
            const replacement = newName.trim();
            const targetLower = target.toLowerCase();

            if (target === replacement) return state;

            const exactRename = (val) => {
                if (!val || typeof val !== 'string') return val;
                if (val.trim().toLowerCase() === targetLower) return replacement;
                return val;
            };

            const textRename = (val) => {
                if (!val || typeof val !== 'string') return val;
                if (val.trim().toLowerCase() === targetLower) return replacement;
                const escapedTarget = target.replace(/[.*+?^$\{}\\(\\)|[\\]\\\\]/g, '\\\\$&');
                try {
                    return val.replace(new RegExp(\`\\\\b\${escapedTarget}\\\\b\`, 'gi'), replacement);
                } catch (e) { return val; }
            };

            const newInnings = (state.innings || []).map(inn => {
                const newBatsmen = (inn.batsmen || []).map(b => ({
                    ...b,
                    name: exactRename(b.name),
                    dismissalText: textRename(b.dismissalText)
                }));

                const renamedBowlers = (inn.bowlers || []).map(b => ({
                    ...b,
                    name: exactRename(b.name)
                }));
                const mergedBowlers = [];
                const bowlerMap = {};
                renamedBowlers.forEach(b => {
                    const key = (b.name || '').trim().toUpperCase();
                    if (!key) { mergedBowlers.push(b); return; }
                    if (bowlerMap[key]) {
                        const existing = bowlerMap[key];
                        const b1Balls = Math.round(Math.floor(existing.overs || 0) * 6 + Math.round(((existing.overs || 0) % 1) * 10));
                        const b2Balls = Math.round(Math.floor(b.overs || 0) * 6 + Math.round(((b.overs || 0) % 1) * 10));
                        const totalBalls = b1Balls + b2Balls;
                        existing.overs = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;
                        existing.runs = (existing.runs || 0) + (b.runs || 0);
                        existing.wickets = (existing.wickets || 0) + (b.wickets || 0);
                        existing.maidens = (existing.maidens || 0) + (b.maidens || 0);
                        existing.fours = (existing.fours || 0) + (b.fours || 0);
                        existing.sixes = (existing.sixes || 0) + (b.sixes || 0);
                    } else {
                        const clone = { ...b };
                        bowlerMap[key] = clone;
                        mergedBowlers.push(clone);
                    }
                });

                const newTimeline = (inn.timeline || []).map(b => ({
                    ...b,
                    batsmanName: exactRename(b.batsmanName),
                    bowlerName: exactRename(b.bowlerName),
                    fielderName: exactRename(b.fielderName)
                }));
                const newThisOver = (inn.thisOver || []).map(b => ({
                    ...b,
                    batsmanName: exactRename(b.batsmanName),
                    bowlerName: exactRename(b.bowlerName)
                }));
                const newFOW = (inn.fallOfWickets || []).map(w => ({
                    ...w,
                    batsmanName: exactRename(w.batsmanName),
                    bowlerName: exactRename(w.bowlerName),
                    newBatsmanName: exactRename(w.newBatsmanName)
                }));

                return {
                    ...inn,
                    batsmen: newBatsmen,
                    bowlers: mergedBowlers,
                    timeline: newTimeline,
                    thisOver: newThisOver,
                    fallOfWickets: newFOW,
                    currentBowlerName: exactRename(inn.currentBowlerName),
                    battingTeam: inn.battingTeam,
                    bowlingTeam: inn.bowlingTeam
                };
            });

            const storagePrefixKeys = Object.keys(localStorage).filter(k => k.endsWith(\`_match_\${state.matchId}\`));
            let existingState = {};
            let appliedKey = \`cricscorer_guest_match_\${state.matchId}\`;
            if (storagePrefixKeys.length > 0) {
                appliedKey = storagePrefixKeys[0];
                try {
                    existingState = JSON.parse(localStorage.getItem(appliedKey)) || {};
                } catch (e) { }
            }

            const newState = {
                ...existingState,
                ...state,
                innings: newInnings,
                team1: state.team1?.name?.trim().toLowerCase() === targetLower ? { ...state.team1, name: replacement } : state.team1,
                team2: state.team2?.name?.trim().toLowerCase() === targetLower ? { ...state.team2, name: replacement } : state.team2,
                tossWinner: exactRename(state.tossWinner),
                batFirst: exactRename(state.batFirst),
                winner: exactRename(state.winner),
                manOfMatch: state.manOfMatch ? { ...state.manOfMatch, name: exactRename(state.manOfMatch.name) } : state.manOfMatch,
                renameCount: (state.renameCount || 0) + 1,
                lastUpdated: Date.now()
            };

            const finalState = validateMatchState(evaluateMatchStatus(newState));

            try {
                localStorage.setItem(appliedKey, JSON.stringify(finalState));
            } catch (e) { }

            return finalState;
        }`;

// Replace the entire block
content = content.replace(startMarker, newBlock);

fs.writeFileSync(path, content);
console.log("Fix applied!");
