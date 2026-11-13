import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const MAGNET_SPRING = { damping: 15, stiffness: 150, mass: 0.1 };

export default function Magnet({
  children,
  className = '',
  padding = 60,
  disabled = false,
  magnetStrength = 2
}) {
  const magnetRef = useRef(null);
  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const x = useSpring(xRaw, MAGNET_SPRING);
  const y = useSpring(yRaw, MAGNET_SPRING);

  const handleMouseMove = (e) => {
    if (disabled || !magnetRef.current) return;
    const { left, top, width, height } = magnetRef.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    const distX = Math.abs(centerX - e.clientX);
    const distY = Math.abs(centerY - e.clientY);

    if (distX < width / 2 + padding && distY < height / 2 + padding) {
      xRaw.set((e.clientX - centerX) / magnetStrength);
      yRaw.set((e.clientY - centerY) / magnetStrength);
    } else {
      xRaw.set(0);
      yRaw.set(0);
    }
  };

  const handleMouseLeave = () => {
    xRaw.set(0);
    yRaw.set(0);
  };

  return (
    <motion.div
      ref={magnetRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x, y }}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}
