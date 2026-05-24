import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { getLeads } from "../lib/api";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

const AppContext = createContext(null);

const ARCEN_PITCH = `Arcen Studio is a premium two-person digital studio based in Mumbai. We build custom websites, full-stack web apps, e-commerce stores, and AI-powered digital products. Every project ships with a 95+ Lighthouse score, 30 days post-launch support, and full source code ownership. No templates. No middlemen. Direct founder access.`;

const ARCEN_SERVICES = `Custom Website Design & Development, Full-Stack Web Applications, E-Commerce (Shopify/WooCommerce/Custom), UI/UX Design & Prototyping, Landing Page & Conversion Design, Website Redesign & Migration, AI & Intelligent Automation Integration, Booking & Appointment Systems, SEO & Performance Optimisation, Monthly Maintenance Retainers`;

export const DEFAULT_CAMPAIGN = {
  name: "Arcen Studio Outreach — May 2026",
  pitch: ARCEN_PITCH,
  services: ARCEN_SERVICES,
  cta: "a 5-minute call this week where we show you exactly what we'd build",
  tone: "Conversational",
  sender_name: "Mehetab Ali",
  sender_email: "shaaz.mehetab@gmail.com",
};

export function AppProvider({ children }) {
  const [screen, setScreen] = useState("home");
  const [campaign, setCampaign] = useState(null);
  const [campaignForm, setCampaignForm] = useState(DEFAULT_CAMPAIGN);
  const [leads, setLeads] = useState([]);
  const [rawLeads, setRawLeads] = useState([]);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const refreshLeads = useCallback(async (campaignId) => {
    if (!campaignId) return;
    const data = await getLeads(campaignId);
    setLeads(data);
  }, []);

  return (
    <AppContext.Provider
      value={{
        screen, setScreen,
        campaign, setCampaign,
        campaignForm, setCampaignForm,
        leads, setLeads,
        rawLeads, setRawLeads,
        refreshLeads,
        firebaseUser, setFirebaseUser,
        authLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
