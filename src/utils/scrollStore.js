/**
 * Fast, synchronous scroll position store.
 * Uses an in-memory Map for zero-latency read/write,
 * backed by sessionStorage for persistence across page reloads.
 */
const scrollPositions = new Map();

export const saveScroll = (key, position) => {
  if (typeof position === 'number' && !isNaN(position)) {
    scrollPositions.set(key, position);
    try {
      sessionStorage.setItem(`scroll_${key}`, position.toString());
    } catch (e) {}
  }
};

export const getScroll = (key) => {
  if (scrollPositions.has(key)) {
    return scrollPositions.get(key) || 0;
  }
  try {
    const saved = sessionStorage.getItem(`scroll_${key}`);
    if (saved !== null) {
      const pos = parseInt(saved, 10) || 0;
      scrollPositions.set(key, pos);
      return pos;
    }
  } catch (e) {}
  return 0;
};

export const clearScroll = (key) => {
  scrollPositions.delete(key);
  try {
    sessionStorage.removeItem(`scroll_${key}`);
  } catch (e) {}
};
