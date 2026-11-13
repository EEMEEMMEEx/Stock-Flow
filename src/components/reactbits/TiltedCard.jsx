import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';

const SPRING_CONFIG = { stiffness: 260, damping: 20 };

export default function TiltedCard({
  children,
  className = '',
  maxTilt = 12,
  glare = true
}) {
  const cardRef = useRef(null);
  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const scaleRaw = useMotionValue(1);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useMotionValue(0);

  const rotateX = useSpring(rotateXRaw, SPRING_CONFIG);
  const rotateY = useSpring(rotateYRaw, SPRING_CONFIG);
  const scale = useSpring(scaleRaw, SPRING_CONFIG);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`;

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    rotateXRaw.set(((y - centerY) / centerY) * -maxTilt);
    rotateYRaw.set(((x - centerX) / centerX) * maxTilt);
    glareX.set((x / rect.width) * 100);
    glareY.set((y / rect.height) * 100);
  };

  const handleMouseEnter = () => {
    scaleRaw.set(1.02);
    glareOpacity.set(0.35);
  };

  const handleMouseLeave = () => {
    scaleRaw.set(1);
    rotateXRaw.set(0);
    rotateYRaw.set(0);
    glareX.set(50);
    glareY.set(50);
    glareOpacity.set(0);
  };

  return (
    <div
      style={{ perspective: 1200 }}
      className={`relative inline-block ${className}`}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          scale,
          transformStyle: 'preserve-3d'
        }}
        className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl"
      >
        {children}
        {glare && (
          <motion.div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: glareOpacity,
              background: glareBackground
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
