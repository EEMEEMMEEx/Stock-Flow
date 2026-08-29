import React from 'react';

/**
 * BaseStationTowerIcon
 * Premium Lucide-style SVG icon of a Telecom Base Station / Control Tower
 * with transmitter antenna, wireless broadcasting signal waves, observation cabin,
 * lattice truss mast with X-bracing, and heavy foundation pedestal.
 */
export const BaseStationTowerIcon = ({ className = 'w-5 h-5', ...props }) => (
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
    {/* Top Antenna Pole & Transmitter Bulb */}
    <path d="M12 6.5V3.5" />
    <circle cx="12" cy="3" r="0.85" />
    
    {/* Wireless Signal Emission Wavefronts */}
    <path d="M9.5 2a2.5 2.5 0 0 0 0 3.5" />
    <path d="M7 1a5 5 0 0 0 0 6" />
    <path d="M14.5 2a2.5 2.5 0 0 1 0 3.5" />
    <path d="M17 1a5 5 0 0 1 0 6" />
    
    {/* Control Room Cabin Roof & Structure */}
    <path d="M8 7h8" />
    <path d="M6 10.5 7.2 7h9.6l1.2 3.5" />
    <path d="M10 7.2l-.6 3.3" />
    <path d="M14 7.2l.6 3.3" />
    
    {/* Platform Gallery Balcony */}
    <path d="M5 11h14" />
    
    {/* Lattice Mast Tower Legs */}
    <path d="M8 11.5 6.5 19.5" />
    <path d="M16 11.5 17.5 19.5" />
    
    {/* Cross-Bracing Truss (X-Bracing) */}
    <path d="M7.6 12.5l8.8 3.5" />
    <path d="M16.4 12.5l-8.8 3.5" />
    <path d="M7 16l10 3.5" />
    <path d="M17 16l-10 3.5" />
    
    {/* Base Foundation Block & Ground Line */}
    <path d="M5 19.5h14v2.5H5z" />
    <path d="M3 22h18" />
  </svg>
);

export default BaseStationTowerIcon;
