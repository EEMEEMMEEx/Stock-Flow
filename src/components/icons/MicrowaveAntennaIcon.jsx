import React from 'react';

/**
 * MicrowaveAntennaIcon
 * Premium SVG icon of a Telecom & Wireless Backhaul Microwave Parabolic Antenna
 * with mounting pedestal, feed horn sub-reflector, and directional signal wavefronts.
 * Exactly matches the industry-standard telecom satellite/microwave dish iconography.
 */
export const MicrowaveAntennaIcon = ({ className = 'w-5 h-5', ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Parabolic Dish Back Curve */}
    <path d="M7 3.5C3.5 7.5 4.5 14 16 16.5" />
    
    {/* Dish Aperture Rim */}
    <path d="M7 3.5c3 4.5 6.5 8.5 9 13" />
    
    {/* Feed Horn Support Struts */}
    <path d="M7.5 7l7.5-1" />
    <path d="M10.5 10.5l4-3.5" />
    <path d="M13.5 14.5l1.5-6" />
    
    {/* Feed Horn Sub-Reflector Bulb */}
    <circle cx="15.5" cy="6.5" r="1.5" />
    
    {/* Mount Neck, Pivot Joint & Base Pedestal */}
    <path d="M7.5 13.5c-.8 1-1.5 2-1.5 3.5" />
    <path d="M3.5 21v-1.5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2V21" />
    <path d="M2 21h8" />
    <circle cx="6" cy="18" r="0.75" />
    
    {/* Directional Microwave Wireless Backhaul Waves */}
    <path d="M18.5 4.5c1.2 1.2 2 2.5 2 4" />
    <path d="M20.5 2.5c2 2 3 4.5 3 6.5" />
  </svg>
);

export default MicrowaveAntennaIcon;
