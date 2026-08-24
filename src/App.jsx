import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import SplashScreenComp from './components/SplashScreen';
import { MatchProvider } from './context/MatchContext';

/* ── Route loading strategy ────────────────────────────────────────────────
   Eager: the launch/hot path only. These are what the user hits first and
   what must never show a loading state.
─────────────────────────────────────────────────────────────────────────── */
import Login from './pages/Login';
import Home from './pages/Home';
import NewMatch from './pages/NewMatch';
import MatchSettings from './pages/MatchSettings';
import PlayerEntry from './pages/PlayerEntry';
import LiveScoring from './pages/LiveScoring';
import InningsBreak from './pages/InningsBreak';
import History from './pages/History';
import Players from './pages/Players';

/* Lazy: heavy or rarely-first-visited. Scorecard pulls in jspdf + html2canvas
   and Analytics pulls in recharts — together the bulk of the old 2.5 MB
   single bundle, all of it parsed at launch even though most sessions never
   open these screens. */
const Scorecard = lazy(() => import('./pages/Scorecard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Congratulations = lazy(() => import('./pages/Congratulations'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const WatchLive = lazy(() => import('./pages/WatchLive'));
const ManualScore = lazy(() => import('./pages/ManualScore'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const CreateTournament = lazy(() => import('./pages/CreateTournament'));
const TournamentDashboard = lazy(() => import('./pages/TournamentDashboard'));

import UpdateChecker from './components/UpdateChecker';
import RecoveryDialog from './components/RecoveryDialog';
import BottomNav from './components/BottomNav';
import './index.css';

/* ── Unified Back Button Handler (Native + Web/PWA) ─────────────────────── */
const HardwareBackHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showExitToast, setShowExitToast] = useState(false);
  const [showLiveExitConfirm, setShowLiveExitConfirm] = useState(false);
  const lastBackPress = React.useRef(0);

  const handleBackAction = (isNative) => {
    const event = new CustomEvent('app-back-button', { cancelable: true });
    window.dispatchEvent(event);
    if (event.defaultPrevented) {
      if (!isNative) window.history.pushState(null, '', window.location.pathname);
      return;
    }

    const path = window.location.pathname;

    if (path === '/' || path === '/home') {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        if (isNative) CapacitorApp.exitApp();
        else window.history.go(-2);
      } else {
        lastBackPress.current = now;
        setShowExitToast(true);
        setTimeout(() => setShowExitToast(false), 2000);
        if (!isNative) window.history.pushState(null, '', path);
      }
      return;
    }

    if (path === '/live-scoring') {
      setShowLiveExitConfirm(true);
      if (!isNative) window.history.pushState(null, '', path);
      return;
    }

    if (path === '/analytics' || path === '/players' || path === '/history') {
      navigate('/home', { replace: true });
      return;
    }

    if (isNative) {
      if (window.history.length > 1) navigate(-1);
      else navigate('/home', { replace: true });
    }
  };

  useEffect(() => {
    let listenerPromise = CapacitorApp.addListener('backButton', () => handleBackAction(true));

    const handlePopState = () => {
      const path = window.location.pathname;
      const trappedPaths = ['/', '/home', '/live-scoring', '/analytics', '/players', '/history'];
      if (trappedPaths.includes(path)) {
        handleBackAction(false);
      }
    };
    
    window.addEventListener('popstate', handlePopState);

    const currentPath = location.pathname;
    const trappedPaths = ['/', '/home', '/live-scoring', '/analytics', '/players', '/history'];
    if (trappedPaths.includes(currentPath)) {
      window.history.pushState(null, '', currentPath);
    }

    return () => {
      listenerPromise.then(listener => listener.remove());
      window.removeEventListener('popstate', handlePopState);
    };
  }, [location.pathname]);

  return (
    <>
      {showExitToast && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30, 27, 75, 0.9)', backdropFilter: 'blur(10px)', color: 'white', 
          padding: '12px 24px', borderRadius: '24px', zIndex: 99999, 
          fontSize: '14px', fontWeight: '600', pointerEvents: 'none', 
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          animation: 'overlayFadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
        }}>
          Press back again to exit
        </div>
      )}

      {showLiveExitConfirm && (
        <div className="modal-overlay" style={{ zIndex: 99999, alignItems: 'center' }}>
          <div className="modal-content" style={{ padding: '32px 24px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1e1b4b', marginBottom: '12px' }}>Leave Match?</h3>
            <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '500', marginBottom: '28px', lineHeight: '1.5' }}>
              Are you sure you want to go back? <br/>
              If you want to Undo, please stay here.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="secondary" 
                onClick={() => setShowLiveExitConfirm(false)} 
                style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#1e1b4b', border: 'none' }}
              >
                Stay & Undo
              </button>
              <button 
                className="primary" 
                onClick={() => {
                  setShowLiveExitConfirm(false);
                  navigate('/home', { replace: true });
                }} 
                style={{ flex: 1, padding: '14px', background: '#ef4444', color: 'white', border: 'none' }}
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* ── Animated Routes Container ──────────────────────────────────────────────
   iOS-style page transition. Direction-aware: back slides from the left,
   forward from the right.

   Three deliberate choices for smoothness on low-end Android:
   1. Transform only, no opacity. This is the big one: fading a whole 100vh
      page forced the compositor to re-blend every layer beneath it (including
      the fixed nav) on every frame. iOS slides pages rather than cross-fading
      them, so dropping opacity is both cheaper and more faithful.
   2. A tween on the iOS navigation curve instead of a spring — a fixed 380ms
      has no long settling tail, so the transition is completely finished
      before the user's next tap lands.
   3. `mode="popLayout"` is kept on purpose. It measures the exiting page once
      per navigation to take it out of flow; without it both pages sit in
      normal flow and stack vertically mid-transition. Doing this in CSS
      instead would mean scrolling inside each page layer, which would break
      useScrollRestore (src/hooks/useScrollRestore.js) — it drives
      window.scrollY / window.scrollTo on the document scroller.
──────────────────────────────────────────────────────────────────────────── */
const RouteFallback = () => <div style={{ flex: 1, minHeight: '100vh' }} />;

const AnimatedRoutes = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const shouldReduceMotion = useReducedMotion();

  // POP = browser back / navigate(-1), PUSH/REPLACE = forward navigation
  const isBack = navigationType === 'POP';

  const variants = shouldReduceMotion
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { x: isBack ? '-30%' : '30%' },
        animate: { x: '0%' },
        exit: { x: isBack ? '30%' : '-30%' },
      };

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.38, ease: [0.32, 0.72, 0, 1] };

  return (
    <div className="page-stack">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
          className="page-layer"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<Login />} />
              <Route path="/home" element={<Home />} />
              <Route path="/new-match" element={<NewMatch />} />
              <Route path="/match-settings" element={<MatchSettings />} />
              <Route path="/player-entry" element={<PlayerEntry />} />
              <Route path="/live-scoring" element={<LiveScoring />} />
              <Route path="/manual-score" element={<ManualScore />} />
              <Route path="/innings-break" element={<InningsBreak />} />
              <Route path="/congratulations" element={<Congratulations />} />
              <Route path="/scorecard" element={<Scorecard />} />
              <Route path="/history" element={<History />} />
              <Route path="/players" element={<Players />} />
              <Route path="/player-profile/:name" element={<PlayerProfile />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/watch-live" element={<WatchLive />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/create-tournament" element={<CreateTournament />} />
              <Route path="/tournament/:id" element={<TournamentDashboard />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const GlobalBottomNav = () => {
  const location = useLocation();
  const showNav = ['/home', '/players', '/history', '/analytics'].includes(location.pathname);
  return showNav ? <BottomNav /> : null;
};

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
     try { SplashScreen.hide().catch(() => {}); } catch (e) {}
     /* ~1.0s, down from 3300ms. Measured against the retimed animation in
        SplashScreen.jsx: ball settles ~520ms, title finishes revealing ~740ms,
        then .splash-wrap fades itself out from 820ms to 1000ms. Unmounting at
        1010ms means the splash has already dismissed itself — no hard cut, and
        no ~2.4s of the user waiting on a finished animation. The overshoot past
        900ms buys the brand ~100ms at full opacity instead of clipping it.
        Keep the two in sync if you retime either. */
     const timer = setTimeout(() => setShowSplash(false), 1010);

    return () => clearTimeout(timer);
  }, []);

  return (
    <MatchProvider>
      {showSplash && <SplashScreenComp />}
      <UpdateChecker />
      <Router>
        <HardwareBackHandler />
        <RecoveryDialog />
        <AnimatedRoutes />
        <GlobalBottomNav />
      </Router>
    </MatchProvider>
  );
}

export default App;
