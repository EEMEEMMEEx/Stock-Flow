import React, { useEffect, useState, useRef } from 'react';

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~|}{[]:;?><,./-=';

export default function DecryptedText({
  text,
  speed = 40,
  maxIterations = 12,
  characters = CHARACTERS,
  className = '',
  parentClassName = '',
  revealDirection = 'start',
  animateOn = 'view'
}) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isDecrypted, setIsDecrypted] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let interval;
    let currentIteration = 0;

    const startDecryption = () => {
      const targetText = text;
      const textLength = targetText.length;

      interval = setInterval(() => {
        setDisplayText((_) => {
          return targetText
            .split('')
            .map((char, index) => {
              if (char === ' ') return ' ';
              if (char === '.' || char === ',' || char === '-') return char;

              let isRevealed = false;
              if (revealDirection === 'start') {
                isRevealed = index < (currentIteration / maxIterations) * textLength;
              } else if (revealDirection === 'end') {
                isRevealed = index > textLength - (currentIteration / maxIterations) * textLength;
              } else {
                isRevealed = Math.random() < currentIteration / maxIterations;
              }

              if (isRevealed) {
                return char;
              }
              return characters[Math.floor(Math.random() * characters.length)];
            })
            .join('');
        });

        currentIteration++;
        if (currentIteration > maxIterations) {
          clearInterval(interval);
          setDisplayText(text);
          setIsDecrypted(true);
        }
      }, speed);
    };

    if (animateOn === 'view') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !isDecrypted) {
              startDecryption();
            }
          });
        },
        { threshold: 0.1 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => {
        clearInterval(interval);
        observer.disconnect();
      };
    } else if (animateOn === 'hover' && isHovering) {
      startDecryption();
      return () => clearInterval(interval);
    }
  }, [text, speed, maxIterations, characters, revealDirection, animateOn, isHovering, isDecrypted]);

  return (
    <span
      ref={containerRef}
      className={`inline-block ${parentClassName}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <span className={className}>{displayText}</span>
    </span>
  );
}
