import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export const generateKnockoutFixtures = (teams) => {
  // Shuffle teams randomly for seeding
  const shuffled = [...teams].sort(() => 0.5 - Math.random());
  
  const matches = [];
  const numTeams = shuffled.length;
  let stage = "final";
  if (numTeams === 8) stage = "quarterfinal";
  else if (numTeams === 4) stage = "semifinal";

  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      matches.push({
        matchId: `m_${Date.now()}_${i}`,
        team1Id: shuffled[i].teamId,
        team2Id: shuffled[i + 1].teamId,
        team1Name: shuffled[i].name,
        team2Name: shuffled[i + 1].name,
        stage: stage,
        status: "upcoming",
        matchNumber: (i / 2) + 1
      });
    }
  }
  return matches;
};

export const generateRoundRobinFixtures = (teams) => {
  const matches = [];
  const n = teams.length;
  let matchCount = 1;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        matchId: `m_${Date.now()}_${i}_${j}`,
        team1Id: teams[i].teamId,
        team2Id: teams[j].teamId,
        team1Name: teams[i].name,
        team2Name: teams[j].name,
        stage: "group",
        status: "upcoming",
        matchNumber: matchCount++
      });
    }
  }
  return matches;
};

export const generateGroupFixtures = (groups) => {
  let allMatches = [];
  let matchCount = 1;
  
  groups.forEach(group => {
    const teamsInGroup = group.teams; // assuming group has {groupId, name, teams: [teamObj...]}
    for (let i = 0; i < teamsInGroup.length; i++) {
      for (let j = i + 1; j < teamsInGroup.length; j++) {
        allMatches.push({
          matchId: `m_${Date.now()}_${group.groupId}_${i}_${j}`,
          team1Id: teamsInGroup[i].teamId,
          team2Id: teamsInGroup[j].teamId,
          team1Name: teamsInGroup[i].name,
          team2Name: teamsInGroup[j].name,
          stage: "group",
          groupId: group.groupId,
          status: "upcoming",
          matchNumber: matchCount++
        });
      }
    }
  });

  return allMatches;
};

export const calculateNRR = (teamId, matches) => {
  let runsScored = 0;
  let ballsFaced = 0;
  let runsConceded = 0;
  let ballsBowled = 0;

  const convertToBalls = (overs) => {
      return Math.floor(overs) * 6 + Math.round((overs % 1) * 10);
  };

  matches.forEach(m => {
    if (m.status !== 'completed' || m.result === 'No result') return;

    if (m.team1Id === teamId) {
      runsScored += m.team1Score?.runs || 0;
      ballsFaced += convertToBalls(m.team1Score?.overs || 0);
      runsConceded += m.team2Score?.runs || 0;
      ballsBowled += convertToBalls(m.team2Score?.overs || 0);
    } else if (m.team2Id === teamId) {
      runsScored += m.team2Score?.runs || 0;
      ballsFaced += convertToBalls(m.team2Score?.overs || 0);
      runsConceded += m.team1Score?.runs || 0;
      ballsBowled += convertToBalls(m.team1Score?.overs || 0);
    }
  });

  if (ballsFaced === 0 && ballsBowled === 0) return 0;
  
  const oversF = ballsFaced / 6;
  const oversB = ballsBowled / 6;

  const nrr = (oversF > 0 ? (runsScored / oversF) : 0) - 
              (oversB > 0 ? (runsConceded / oversB) : 0);
  return Number(nrr.toFixed(3));
};

export const updatePointsTable = (teams, matches, format) => {
  let pointsTable = teams.map(t => ({
    teamId: t.teamId,
    teamName: t.name,
    groupId: t.groupId,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    points: 0,
    nrr: 0
  }));

  matches.forEach(m => {
    if (m.status !== 'completed' || m.stage !== 'group') return;

    const t1 = pointsTable.find(t => t.teamId === m.team1Id);
    const t2 = pointsTable.find(t => t.teamId === m.team2Id);

    if (t1 && t2) {
      t1.played++;
      t2.played++;

      if (m.winnerId === m.team1Id) {
        t1.won++;
        t1.points += 2;
        t2.lost++;
      } else if (m.winnerId === m.team2Id) {
        t2.won++;
        t2.points += 2;
        t1.lost++;
      } else {
        t1.tied++;
        t2.tied++;
        t1.points += 1;
        t2.points += 1;
      }
    }
  });

  // Calculate NRR
  pointsTable.forEach(t => {
    t.nrr = calculateNRR(t.teamId, matches);
  });

  // Sort by points -> NRR
  pointsTable.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.nrr - a.nrr;
  });

  return pointsTable;
};

export const updateTournamentMatch = async (tournamentId, matchId, matchState) => {
  const existing = JSON.parse(localStorage.getItem('cricscore_tournaments') || '[]');
  const tIndex = existing.findIndex(t => t.tournamentId === tournamentId);
  if (tIndex === -1) return;

  const t = existing[tIndex];
  const mIndex = t.matches.findIndex(m => m.matchId === matchId);
  if (mIndex === -1) return;

  const match = t.matches[mIndex];
  match.status = 'completed';
  
  if (matchState.winner === 'Tie' || !matchState.winner) {
    match.result = 'Match Tied';
    match.winnerId = null;
    match.winnerName = 'Tie';
  } else {
    match.result = `${matchState.winner} won by ${matchState.winMargin} ${matchState.winType}`;
    match.winnerName = matchState.winner;
    match.winnerId = match.team1Name === matchState.winner ? match.team1Id : match.team2Id;
  }

  // Update scores
  const inn1 = matchState.innings[0];
  const inn2 = matchState.innings[1];
  
  if (inn1) {
    const isTeam1 = inn1.battingTeam === match.team1Name;
    if (isTeam1) {
      match.team1Score = { runs: inn1.runs, wickets: inn1.wickets, overs: inn1.overs };
    } else {
      match.team2Score = { runs: inn1.runs, wickets: inn1.wickets, overs: inn1.overs };
    }
  }
  
  if (inn2) {
    const isTeam2 = inn2.battingTeam === match.team2Name;
    if (isTeam2) {
      match.team2Score = { runs: inn2.runs, wickets: inn2.wickets, overs: inn2.overs };
    } else {
      match.team1Score = { runs: inn2.runs, wickets: inn2.wickets, overs: inn2.overs };
    }
  }

  // Save the complete match state so we can use it in History/Players/Analytics
  match.matchState = matchState;


  // Generate next knockout fixtures if applicable
  if (match.stage !== 'group') {
    // Check if all matches in current stage are completed
    const stageMatches = t.matches.filter(m => m.stage === match.stage);
    if (stageMatches.every(m => m.status === 'completed')) {
       // All complete, generate next round
       let nextStage = '';
       if (match.stage === 'quarterfinal') nextStage = 'semifinal';
       else if (match.stage === 'semifinal') nextStage = 'final';

       if (nextStage) {
          const newMatches = [];
          for (let i = 0; i < stageMatches.length; i += 2) {
             const m1 = stageMatches[i];
             const m2 = stageMatches[i+1];
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

  // Update Points Table
  if (t.format === 'roundrobin' || t.format === 'group_knockout') {
    t.pointsTable = updatePointsTable(t.teams, t.matches, t.format);
  }

  // Check if tournament is complete
  if (match.stage === 'final' || (t.format === 'roundrobin' && t.matches.every(m => m.status === 'completed'))) {
    t.status = 'completed';
  } else if (t.status === 'upcoming') {
    t.status = 'ongoing';
  }

  const now = Date.now();
  // Stamp LWW sync fields — createdAt is set once, updatedAt always bumped
  if (!t.createdAt) t.createdAt = now;
  t.updatedAt = now;
  t.lastUpdated = now;  // Legacy compat

  existing[tIndex] = t;
  localStorage.setItem('cricscore_tournaments', JSON.stringify(existing));
  localStorage.setItem('cricscore_active_tournament', JSON.stringify(t));
  console.log(`[Sync] updateTournamentMatch: saved tournament ${tournamentId}, updatedAt=${now}`);

  try {
     const tDoc = doc(db, 'tournaments', tournamentId);
     await setDoc(tDoc, t, { merge: true });
     console.log(`[Sync] updateTournamentMatch: synced tournament ${tournamentId} to Firestore`);
  } catch (err) {
     console.error('[Sync] Firestore tournament sync failed:', err);
  }
};
