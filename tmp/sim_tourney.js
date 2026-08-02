const convertToBalls = (overs) => {
    return Math.floor(overs) * 6 + Math.round((overs % 1) * 10);
};

const calculateNRR = (teamId, matches) => {
  let runsScored = 0;
  let ballsFaced = 0;
  let runsConceded = 0;
  let ballsBowled = 0;

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

const updatePointsTable = (teams, matches) => {
  let pointsTable = teams.map(t => ({
    teamId: t.teamId,
    teamName: t.name,
    played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0
  }));

  matches.forEach(m => {
    if (m.status !== 'completed') return;

    const t1 = pointsTable.find(t => t.teamId === m.team1Id);
    const t2 = pointsTable.find(t => t.teamId === m.team2Id);

    if (t1 && t2) {
      t1.played++;
      t2.played++;

      if (m.winnerId === m.team1Id) {
        t1.won++; t1.points += 2; t2.lost++;
      } else if (m.winnerId === m.team2Id) {
        t2.won++; t2.points += 2; t1.lost++;
      } else {
        t1.tied++; t2.tied++; t1.points += 1; t2.points += 1;
      }
    }
  });

  pointsTable.forEach(t => {
    t.nrr = calculateNRR(t.teamId, matches);
  });

  pointsTable.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.nrr - a.nrr;
  });

  return pointsTable;
};

// --- RUN SIMULATION ---

const teams = [
  { teamId: 'M1', name: 'Mumbai' },
  { teamId: 'D1', name: 'Delhi' },
  { teamId: 'C1', name: 'Chennai' },
  { teamId: 'K1', name: 'Kolkata' },
  { teamId: 'B1', name: 'Bangalore' }
];

const matches = [
  { matchId: 'm1', team1Id: 'M1', team2Id: 'D1', team1Name: 'Mumbai', team2Name: 'Delhi', status: 'completed', winnerId: 'M1', team1Score: { runs: 25, overs: 2, wickets: 1 }, team2Score: { runs: 20, overs: 2, wickets: 3 } },
  { matchId: 'm2', team1Id: 'M1', team2Id: 'C1', team1Name: 'Mumbai', team2Name: 'Chennai', status: 'completed', winnerId: 'C1', team1Score: { runs: 18, overs: 2, wickets: 2 }, team2Score: { runs: 19, overs: 1.4, wickets: 1 } },
  { matchId: 'm3', team1Id: 'M1', team2Id: 'K1', team1Name: 'Mumbai', team2Name: 'Kolkata', status: 'completed', winnerId: 'M1', team1Score: { runs: 30, overs: 2, wickets: 0 }, team2Score: { runs: 28, overs: 2, wickets: 4 } },
  { matchId: 'm4', team1Id: 'M1', team2Id: 'B1', team1Name: 'Mumbai', team2Name: 'Bangalore', status: 'completed', winnerId: 'B1', team1Score: { runs: 15, overs: 2, wickets: 5 }, team2Score: { runs: 16, overs: 1.5, wickets: 3 } },
  { matchId: 'm5', team1Id: 'D1', team2Id: 'C1', team1Name: 'Delhi', team2Name: 'Chennai', status: 'completed', winnerId: null, team1Score: { runs: 22, overs: 2, wickets: 2 }, team2Score: { runs: 22, overs: 2, wickets: 3 }, result: 'Match Tied' },
  { matchId: 'm6', team1Id: 'D1', team2Id: 'K1', team1Name: 'Delhi', team2Name: 'Kolkata', status: 'completed', winnerId: 'D1', team1Score: { runs: 28, overs: 2, wickets: 1 }, team2Score: { runs: 25, overs: 2, wickets: 4 } },
  { matchId: 'm7', team1Id: 'D1', team2Id: 'B1', team1Name: 'Delhi', team2Name: 'Bangalore', status: 'completed', winnerId: 'B1', team1Score: { runs: 20, overs: 2, wickets: 3 }, team2Score: { runs: 21, overs: 1.3, wickets: 2 } },
  { matchId: 'm8', team1Id: 'C1', team2Id: 'K1', team1Name: 'Chennai', team2Name: 'Kolkata', status: 'completed', winnerId: 'C1', team1Score: { runs: 35, overs: 2, wickets: 2 }, team2Score: { runs: 30, overs: 2, wickets: 6 } },
  { matchId: 'm9', team1Id: 'C1', team2Id: 'B1', team1Name: 'Chennai', team2Name: 'Bangalore', status: 'completed', winnerId: 'B1', team1Score: { runs: 25, overs: 2, wickets: 3 }, team2Score: { runs: 26, overs: 1.2, wickets: 1 } },
  { matchId: 'm10', team1Id: 'K1', team2Id: 'B1', team1Name: 'Kolkata', team2Name: 'Bangalore', status: 'completed', winnerId: 'K1', team1Score: { runs: 40, overs: 2, wickets: 1 }, team2Score: { runs: 38, overs: 2, wickets: 4 } }
];

const table = updatePointsTable(teams, matches);
console.log(JSON.stringify(table, null, 2));
