import React from 'react';

export default function ShinyText({
  text,
  disabled = false,
  speed = 3,
  className = '',
  shimmerColor = '#ffffff'
}) {
  return (
    <span
      className={`inline-block relative overflow-hidden bg-clip-text text-transparent ${
        disabled ? 'text-zinc-400' : ''
      } ${className}`}
      style={{
        backgroundImage: disabled
          ? 'none'
          : `linear-gradient(120deg, rgba(255, 255, 255, 0.4) 0%, ${shimmerColor} 50%, rgba(255, 255, 255, 0.4) 100%)`,
        backgroundSize: '200% 100%',
        animation: disabled ? 'none' : `shiny-text-shimmer ${speed}s linear infinite`,
      }}
    >
      {text}
    </span>
  );
}
