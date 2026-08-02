import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import SplashScreenComp from './components/SplashScreen';
import { MatchProvider } from './context/MatchContext';
import Login from './pages/Login';
import Home from './pages/Home';
import NewMatch from './pages/NewMatch';
import MatchSettings from './pages/MatchSettings';
import PlayerEntry from './pages/PlayerEntry';
import LiveScoring from './pages/LiveScoring';
import InningsBreak from './pages/InningsBreak';
import Congratulations from './pages/Congratulations';
import Scorecard from './pages/Scorecard';
import History from './pages/History';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Analytics from './pages/Analytics';
import WatchLive from './pages/WatchLive';
import ManualScore from './pages/ManualScore';
import Tournaments from './pages/Tournaments';
import CreateTournament from './pages/CreateTournament';
import TournamentDashboard from './pages/TournamentDashboard';
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
   Uses framer-motion AnimatePresence to smoothly animate page entry and exit.
   Direction-aware: back navigation slides from left, forward from right.
──────────────────────────────────────────────────────────────────────────── */
const AnimatedRoutes = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const shouldReduceMotion = useReducedMotion();

  // POP = browser back / navigate(-1), PUSH/REPLACE = forward navigation
  const isBack = navigationType === 'POP';

  const variants = shouldReduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, x: isBack ? '-35%' : '35%' },
        animate: { opacity: 1, x: '0%' },
        exit: { opacity: 0, x: isBack ? '35%' : '-35%' },
      };

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 350, damping: 32, mass: 0.8 };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', flex: 1, overflowX: 'hidden' }}
      >
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
      </motion.div>
    </AnimatePresence>
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
     const timer = setTimeout(() => setShowSplash(false), 3300);

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
