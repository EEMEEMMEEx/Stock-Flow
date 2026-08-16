import React from 'react';
import { ArrowUpRight, Github, ExternalLink, ShieldCheck } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="bg-zinc-950 border-t border-white/10 text-zinc-400 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-sm text-white">Stock-Flow</span>
            <span className="text-xs text-zinc-500 ml-2">Enterprise Inventory OS</span>
          </div>
        </div>

        {/* Live System Operational Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-xs text-zinc-300 font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>All Services Operational</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-xs">
          <a
            href="https://stock-flow-pi-coral.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 transition-colors"
          >
            <span>Live Web App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://github.com/bearnannan/Stock-Flow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-zinc-300 hover:text-white transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub Repository</span>
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-zinc-500 font-mono">
        <p>&copy; {new Date().getFullYear()} Stock-Flow. Built for high-reliability inventory workflows.</p>
        <p>Zero Emojis · Strict SVG Iconography · Reactbits Animated</p>
      </div>
    </footer>
  );
}
