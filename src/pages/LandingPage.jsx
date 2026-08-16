import React, { useEffect } from 'react';
import LandingNavbar from '../components/landing/LandingNavbar';
import HeroSection from '../components/landing/HeroSection';
import StatsSection from '../components/landing/StatsSection';
import BentoFeatures from '../components/landing/BentoFeatures';
import WorkflowSection from '../components/landing/WorkflowSection';
import TechStackSection from '../components/landing/TechStackSection';
import CtaSection from '../components/landing/CtaSection';
import LandingFooter from '../components/landing/LandingFooter';
import { LandingLanguageProvider } from '@/contexts/LandingLanguageContext';

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
