import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING_PRESET } from '../utils/animationPresets';

const AnimatedPage = ({ children, style = {}, className = '' }) => {
  const shouldReduceMotion = useReducedMotion();

  const variants = {
    initial: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -24 },
  };

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transition}
      className={className}
      style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', flex: 1, overflowX: 'hidden', ...style }}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedPage;
