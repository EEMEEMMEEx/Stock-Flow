import React, { useEffect } from 'react';
import LandingNavbar from './components/LandingNavbar';
import HeroSection from './components/HeroSection';
import StatsSection from './components/StatsSection';
import BentoFeatures from './components/BentoFeatures';
import WorkflowSection from './components/WorkflowSection';
import TechStackSection from './components/TechStackSection';
import CtaSection from './components/CtaSection';
import LandingFooter from './components/LandingFooter';
import { LandingLanguageProvider } from './context/LandingLanguageContext';

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Stock-Flow | Precision Inventory & Material Flow OS';
  }, []);

  return (
    <LandingLanguageProvider>
      <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500 selection:text-black">
        <LandingNavbar />
        <main>
          <HeroSection />
          <StatsSection />
          <BentoFeatures />
          <WorkflowSection />
          <TechStackSection />
          <CtaSection />
        </main>
        <LandingFooter />
      </div>
    </LandingLanguageProvider>
  );
}
