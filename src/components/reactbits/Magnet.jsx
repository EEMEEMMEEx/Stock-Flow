import { useCallback, useEffect, useRef } from 'react';
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
  const rectRef = useRef(null);
  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const x = useSpring(xRaw, MAGNET_SPRING);
  const y = useSpring(yRaw, MAGNET_SPRING);

  const invalidateRect = useCallback(() => {
    rectRef.current = null;
  }, []);

  const unwatchViewport = useCallback(() => {
    window.removeEventListener('scroll', invalidateRect, true);
    window.removeEventListener('resize', invalidateRect);
  }, [invalidateRect]);

  const watchViewport = useCallback(() => {
    unwatchViewport();
    window.addEventListener('scroll', invalidateRect, { capture: true, passive: true });
    window.addEventListener('resize', invalidateRect, { passive: true });
  }, [invalidateRect, unwatchViewport]);

  useEffect(() => unwatchViewport, [unwatchViewport]);

  const handleMouseEnter = () => {
    if (!disabled && magnetRef.current) {
      rectRef.current = magnetRef.current.getBoundingClientRect();
      watchViewport();
    }
  };

  const handleMouseMove = (e) => {
    if (disabled || !magnetRef.current) return;
    const rect = rectRef.current || magnetRef.current.getBoundingClientRect();
    rectRef.current = rect;
    const { left, top, width, height } = rect;
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
    unwatchViewport();
    rectRef.current = null;
    xRaw.set(0);
    yRaw.set(0);
  };

  return (
    <motion.div
      ref={magnetRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x, y }}
      className={`inline-block will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  );
}
