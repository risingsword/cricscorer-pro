/* ── Shared motion language ─────────────────────────────────────────────────
   One place for every duration, curve and tap scale so the app moves
   consistently instead of each screen inventing its own timing.

   Tuned to Apple's feel, which comes down to three rules:
     1. Decisive start, hard deceleration — EASE_IOS below is the standard
        navigation/emphasis curve.
     2. Short. Nothing user-initiated should outlast ~300ms, because the next
        tap arrives before a long spring has finished settling.
     3. Restrained. Feedback should read as tactile, not bouncy — hence a
        0.97 tap scale rather than the 0.85–0.93 this app used to use.

   The equivalent CSS tokens live in src/index.css (--ease-ios, --tap-dur,
   --tap-scale). Keep the two in sync if you change either.
─────────────────────────────────────────────────────────────────────────── */

/** Apple's standard easing curve. Use for anything spatial. */
export const EASE_IOS = [0.32, 0.72, 0, 1];

/** For opacity/colour, where a spatial curve would look sluggish. */
export const EASE_OUT = [0.4, 0, 0.2, 1];

/* ── Transitions ───────────────────────────────────────────────────────────
   Tweens rather than springs: a spring's tail keeps animating long after it
   looks finished, which on a low-end device is real frame budget spent on
   motion nobody can see.
─────────────────────────────────────────────────────────────────────────── */

/** Default for element enter/exit and layout shifts. */
export const SPRING_PRESET = { duration: 0.28, ease: EASE_IOS };

/** Slightly softer/longer — for larger surfaces like sheets and modals. */
export const SPRING_BOUNCE = { duration: 0.34, ease: EASE_IOS };

/** Immediate feedback: taps, toggles, small state flips. */
export const SPRING_FAST = { duration: 0.18, ease: EASE_IOS };

/* ── Tap feedback ──────────────────────────────────────────────────────────
   Note: most tappable elements already get this from CSS :active in
   index.css (.tap, button, .tap-card). Only reach for these in JSX when the
   element genuinely can't use the CSS classes — applying both makes the two
   fight over the same transform.
─────────────────────────────────────────────────────────────────────────── */
export const TAP_SCALE = { scale: 0.97 };

/** Cards. No boxShadow here on purpose — animating a shadow repaints its
 *  blur every frame for an effect that's barely visible during a 180ms tap. */
export const TAP_CARD_SCALE = { scale: 0.97 };

/* ── Page transitions ──────────────────────────────────────────────────────
   Transform only, no opacity: iOS slides pages rather than cross-fading
   them, and fading a full-height page forces the compositor to re-blend
   everything beneath it on every frame. See AnimatedRoutes in src/App.jsx,
   which builds the direction-aware version of this.
─────────────────────────────────────────────────────────────────────────── */
export const PAGE_VARIANTS = {
  initial: { x: '30%' },
  animate: { x: '0%' },
  exit: { x: '-30%' },
};

export const PAGE_TRANSITION = { duration: 0.38, ease: EASE_IOS };

/** Staggered list reveal. Matches --stagger-step in index.css. */
export const STAGGER_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.024, delayChildren: 0.02 } },
};

export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING_PRESET },
};
