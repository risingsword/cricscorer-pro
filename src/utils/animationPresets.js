export const SPRING_PRESET = {
  type: "spring",
  stiffness: 300,
  damping: 25,
};

export const SPRING_BOUNCE = {
  type: "spring",
  stiffness: 400,
  damping: 18,
};

export const SPRING_FAST = {
  type: "spring",
  stiffness: 450,
  damping: 28,
};

export const TAP_SCALE = { scale: 0.96 };
export const TAP_CARD_SCALE = { scale: 0.96, boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)" };

export const PAGE_VARIANTS = {
  initial: { opacity: 0, x: "30%" },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: "-30%" },
};

export const PAGE_TRANSITION = {
  type: "spring",
  stiffness: 320,
  damping: 32,
  mass: 0.8
};
