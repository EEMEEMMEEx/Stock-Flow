import { useRef, useEffect } from 'react';

export default function Squares({
  direction = 'right',
  speed = 0.5,
  borderColor = 'rgba(255, 255, 255, 0.08)',
  squareSize = 40,
  hoverFillColor = 'rgba(16, 185, 129, 0.15)',
  className = ''
}) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const numSquaresX = useRef(0);
  const numSquaresY = useRef(0);
  const gridOffset = useRef({ x: 0, y: 0 });
  const hoveredSquareRef = useRef(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const startX = Math.floor(gridOffset.current.x / squareSize) * squareSize;
      const startY = Math.floor(gridOffset.current.y / squareSize) * squareSize;
      const offsetX = gridOffset.current.x % squareSize;
      const offsetY = gridOffset.current.y % squareSize;
      const hovered = hoveredSquareRef.current;

      if (hovered) {
        const hoveredX = startX + hovered.x * squareSize - offsetX;
        const hoveredY = startY + hovered.y * squareSize - offsetY;
        ctx.fillStyle = hoverFillColor;
        ctx.fillRect(hoveredX, hoveredY, squareSize, squareSize);
      }

      ctx.beginPath();
      ctx.strokeStyle = borderColor;

      const maxX = canvas.width + squareSize;
      const maxY = canvas.height + squareSize;

      for (let x = startX; x < maxX; x += squareSize) {
        const lineX = x - offsetX;
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, canvas.height);
      }

      for (let y = startY; y < maxY; y += squareSize) {
        const lineY = y - offsetY;
        ctx.moveTo(0, lineY);
        ctx.lineTo(canvas.width, lineY);
      }

      ctx.stroke();
    };

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      numSquaresX.current = Math.ceil(canvas.width / squareSize) + 1;
      numSquaresY.current = Math.ceil(canvas.height / squareSize) + 1;
      if (prefersReducedMotion) {
        renderGrid();
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const draw = () => {
      if (!isVisibleRef.current || prefersReducedMotion) {
        requestRef.current = null;
        return;
      }

      renderGrid();

      const effectiveSpeed = Math.max(speed, 0.1);
      switch (direction) {
        case 'right':
          gridOffset.current.x = (gridOffset.current.x - effectiveSpeed + squareSize) % squareSize;
          break;
        case 'left':
          gridOffset.current.x = (gridOffset.current.x + effectiveSpeed + squareSize) % squareSize;
          break;
        case 'up':
          gridOffset.current.y = (gridOffset.current.y + effectiveSpeed + squareSize) % squareSize;
          break;
        case 'down':
          gridOffset.current.y = (gridOffset.current.y - effectiveSpeed + squareSize) % squareSize;
          break;
        case 'diagonal':
          gridOffset.current.x = (gridOffset.current.x - effectiveSpeed + squareSize) % squareSize;
          gridOffset.current.y = (gridOffset.current.y - effectiveSpeed + squareSize) % squareSize;
          break;
        default:
          break;
      }

      requestRef.current = requestAnimationFrame(draw);
    };

    // IntersectionObserver to pause loop when scrolled out of view
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting && !prefersReducedMotion && !requestRef.current) {
        requestRef.current = requestAnimationFrame(draw);
      }
    }, { threshold: 0.05 });
    observer.observe(canvas);

    if (prefersReducedMotion) {
      renderGrid();
    } else {
      draw();
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      observer.disconnect();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [direction, speed, borderColor, hoverFillColor, squareSize]);

  const handleMouseMove = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const hoveredSquareX = Math.floor((mouseX + (gridOffset.current.x % squareSize)) / squareSize);
    const hoveredSquareY = Math.floor((mouseY + (gridOffset.current.y % squareSize)) / squareSize);

    hoveredSquareRef.current = { x: hoveredSquareX, y: hoveredSquareY };
  };

  const handleMouseLeave = () => {
    hoveredSquareRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`w-full h-full border-none block pointer-events-auto ${className}`}
    />
  );
}
