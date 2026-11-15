import { useCallback, useEffect, useRef } from 'react';

export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(16, 185, 129, 0.15)',
  borderColor = 'rgba(255, 255, 255, 0.1)'
}) {
  const divRef = useRef(null);
  const overlayRef = useRef(null);
  const rectRef = useRef(null);
  const rafRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

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

  useEffect(() => {
    return () => {
      unwatchViewport();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [unwatchViewport]);

  const handleMouseMove = (e) => {
    if (!divRef.current || !overlayRef.current) return;
    const rect = rectRef.current || divRef.current.getBoundingClientRect();
    rectRef.current = rect;
    pointerRef.current.x = e.clientX - rect.left;
    pointerRef.current.y = e.clientY - rect.top;

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (overlayRef.current) {
          const { x, y } = pointerRef.current;
          overlayRef.current.style.background = `radial-gradient(600px circle at ${x}px ${y}px, ${spotlightColor}, transparent 40%)`;
        }
      });
    }
  };

  const handleMouseEnter = () => {
    if (divRef.current) {
      rectRef.current = divRef.current.getBoundingClientRect();
    }
    watchViewport();
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '1';
    }
  };

  const handleMouseLeave = () => {
    unwatchViewport();
    rectRef.current = null;
    if (overlayRef.current) {
      overlayRef.current.style.opacity = '0';
    }
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-2xl border bg-zinc-900/60 backdrop-blur-md overflow-hidden transition-all duration-300 ${className}`}
      style={{ borderColor }}
    >
      <div
        ref={overlayRef}
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{ opacity: 0 }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
