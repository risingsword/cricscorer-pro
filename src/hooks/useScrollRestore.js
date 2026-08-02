import { useLayoutEffect, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { saveScroll, getScroll } from '../utils/scrollStore';

/**
 * useScrollRestore — Invisible "Ready Then Reveal" Pre-Paint Scroll Restoration Hook.
 *
 * Prevents any visible wrong-position frames or snapping:
 * 1. Sets container opacity to 0 before paint if restoring scroll position.
 * 2. Applies window.scrollTo(0, savedY) in useLayoutEffect pre-paint.
 * 3. Confirms layout stability on next rAF frame and smoothly reveals (opacity -> 1).
 *
 * Route-aware: ignores scroll events when navigating away so Framer Motion exit transitions
 * never overwrite saved scroll positions.
 *
 * @param {string} key   — Unique key for this screen (e.g. 'history', 'players')
 * @param {boolean} enabled — Set false to defer restore until content is ready (default true)
 * @param {React.RefObject} containerRef — Optional ref to screen container for invisible reveal
 */
export default function useScrollRestore(key, enabled = true, containerRef = null) {
  const location = useLocation();
  const hasRestored = useRef(false);
  const isUserScrolling = useRef(false);
  const lastSaveTime = useRef(0);
  const rafId = useRef(null);

  // Pre-paint scroll restore + Ready-Then-Reveal
  useLayoutEffect(() => {
    if (!enabled || hasRestored.current) return;

    const saved = getScroll(key);
    if (saved <= 0) {
      hasRestored.current = true;
      if (containerRef?.current) {
        containerRef.current.style.opacity = '1';
      }
      return;
    }

    // Hide container before paint so zero wrong-position frames are visible
    if (containerRef?.current) {
      containerRef.current.style.opacity = '0';
    }

    // Pre-paint scroll
    window.scrollTo(0, saved);

    // Confirm layout stability on next frame and reveal cleanly
    rafId.current = requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - saved) > 1 && document.documentElement.scrollHeight >= saved) {
        window.scrollTo(0, saved);
      }

      requestAnimationFrame(() => {
        if (containerRef?.current) {
          containerRef.current.style.opacity = '1';
        }
        hasRestored.current = true;
      });
    });

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [key, enabled, containerRef]);

  // Reset restoration flag when key changes
  useEffect(() => {
    hasRestored.current = false;
    isUserScrolling.current = false;
  }, [key]);

  // Active route checking & throttled scroll listener
  useEffect(() => {
    if (!enabled) return;

    const onUserInteraction = () => {
      isUserScrolling.current = true;
    };

    const handleScroll = () => {
      // ROUTE CHECK: Only save if location.pathname matches this screen's key/route!
      // When navigating away (e.g. to /scorecard), target screen's scrollTo(0,0) or Framer Motion
      // exit transition fires scroll events with scrollY = 0.
      // Ignoring scroll events when location.pathname has changed prevents overwriting saved position with 0!
      const currentPath = location.pathname.toLowerCase();
      const targetKey = key.toLowerCase().replace('tournament-', '/tournament/');
      const matchesRoute = currentPath === `/${targetKey}` || currentPath === targetKey || currentPath.includes(targetKey);

      if (!matchesRoute) return;

      const currentY = window.scrollY;
      const now = Date.now();

      if (now - lastSaveTime.current < 100) return;

      if (currentY > 0) {
        saveScroll(key, currentY);
      }
      lastSaveTime.current = now;
    };

    window.addEventListener('touchstart', onUserInteraction, { passive: true });
    window.addEventListener('wheel', onUserInteraction, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onUserInteraction);
      window.removeEventListener('wheel', onUserInteraction);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [key, enabled, location.pathname]);
}
