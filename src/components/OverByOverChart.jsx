import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { ChevronDown } from 'lucide-react';

const OverByOverChart = ({ innings, team1Name, team2Name, totalOvers }) => {
  const [view, setView] = useState('per-over'); // 'per-over' or 'cumulative'
  const [isOpen, setIsOpen] = useState(false);

  const chartData = useMemo(() => {
    if (!innings || innings.length === 0) return [];

    const processInningsOvers = (inn) => {
      const oversList = [];
      let currentOver = { num: 1, runs: 0, balls: [] };

      const timeline = inn?.timeline || [];
      timeline.forEach((ball, idx) => {
        currentOver.balls.push(ball);
        currentOver.runs += ((ball.runs || 0) + (ball.extras || 0));

        const legalBalls = currentOver.balls.filter(b => !b.isWide && !b.isNoBall).length;
        if (legalBalls === 6 || idx === timeline.length - 1) {
          oversList.push({
            num: currentOver.num,
            runs: currentOver.runs
          });
          currentOver = { num: oversList.length + 1, runs: 0, balls: [] };
        }
      });
      return oversList;
    };

    const inn1Overs = processInningsOvers(innings[0]);
    const inn2Overs = processInningsOvers(innings[1]);

    const maxOvers = Math.max(
      totalOvers || 0,
      inn1Overs.length,
      inn2Overs.length
    );

    let cumulativeRuns1 = 0;
    let cumulativeRuns2 = 0;

    const data = [];
    for (let i = 0; i < maxOvers; i++) {
      const o1 = inn1Overs[i];
      const o2 = inn2Overs[i];

      const runs1 = o1 ? o1.runs : 0;
      const runs2 = o2 ? o2.runs : 0;

      cumulativeRuns1 += runs1;
      cumulativeRuns2 += runs2;

      data.push({
        over: `Ov ${i + 1}`,
        team1: view === 'cumulative' ? cumulativeRuns1 : runs1,
        team2: view === 'cumulative' ? cumulativeRuns2 : runs2
      });
    }

    return data;
  }, [innings, view, totalOvers]);

  if (!chartData || chartData.length === 0) return null;

  const minWidth = chartData.length * 60;

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '8px 16px',
      margin: '8px 0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
    }}>
      {/* Header with Title and Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsOpen(!isOpen)}>
        <h4 style={{ fontSize: '13px', fontWeight: '800', margin: 0, color: '#1e1b4b' }}>
          Graph View
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isOpen && (
            <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setView('per-over')}
                style={{
                  padding: '2px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', border: '1px solid',
                  borderColor: view === 'per-over' ? '#e94560' : '#e2e8f0',
                  background: view === 'per-over' ? '#e94560' : 'transparent',
                  color: view === 'per-over' ? 'white' : '#64748b',
                  cursor: 'pointer',
                  height: '24px',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Per Over
              </button>
              <button
                onClick={() => setView('cumulative')}
                style={{
                  padding: '2px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', border: '1px solid',
                  borderColor: view === 'cumulative' ? '#e94560' : '#e2e8f0',
                  background: view === 'cumulative' ? '#e94560' : 'transparent',
                  color: view === 'cumulative' ? 'white' : '#64748b',
                  cursor: 'pointer',
                  height: '24px',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Cumulative
              </button>
            </div>
          )}
          <ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s', color: '#94a3b8' }} />
        </div>
      </div>

      {/* Chart Container with Scroll */}
      {isOpen && (
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ minWidth: `${minWidth}px`, height: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {view === 'per-over' ? (
                <BarChart
                  data={chartData}
                  margin={{ top: 25, right: 10, left: -20, bottom: 5 }}
                  barCategoryGap="30%"
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="over" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#1e1b4b', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} formatter={(value, name) => [value + ' runs', name]} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px', color: '#475569' }} />
                  <Bar dataKey="team1" name={team1Name} fill="#4488ff" radius={[4, 4, 0, 0]} maxBarSize={20}>
                    <LabelList dataKey="team1" position="top" style={{ fill: '#4488ff', fontSize: '10px', fontWeight: 'bold' }} />
                  </Bar>
                  <Bar dataKey="team2" name={team2Name} fill="#e94560" radius={[4, 4, 0, 0]} maxBarSize={20}>
                    <LabelList dataKey="team2" position="top" style={{ fill: '#e94560', fontSize: '10px', fontWeight: 'bold' }} />
                  </Bar>
                </BarChart>
              ) : (
                <LineChart
                  data={chartData}
                  margin={{ top: 25, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="over" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#1e1b4b', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} formatter={(value, name) => [value + ' runs', name]} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px', color: '#475569' }} />
                  <Line type="monotone" dataKey="team1" name={team1Name} stroke="#4488ff" strokeWidth={3} dot={{ r: 4, fill: '#4488ff' }} activeDot={{ r: 6 }}>
                    <LabelList dataKey="team1" position="top" style={{ fill: '#4488ff', fontSize: '10px', fontWeight: 'bold' }} />
                  </Line>
                  <Line type="monotone" dataKey="team2" name={team2Name} stroke="#e94560" strokeWidth={3} dot={{ r: 4, fill: '#e94560' }} activeDot={{ r: 6 }}>
                    <LabelList dataKey="team2" position="top" style={{ fill: '#e94560', fontSize: '10px', fontWeight: 'bold' }} />
                  </Line>
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverByOverChart;
