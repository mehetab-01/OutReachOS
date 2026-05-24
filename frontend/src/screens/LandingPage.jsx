import { ArrowRight, Wand2, CheckCircle2, Zap, Shield, BarChart2, Mail, Upload, Settings, Eye, Send } from "lucide-react";
import { Button } from "../components/ui/button";

const FEATURES = [
  {
    icon: Wand2,
    title: "AI That Actually Researches",
    desc: "Before writing a single word, the AI scans each business — competitors, market gaps, what they're missing. Every email is grounded in real context.",
  },
  {
    icon: Shield,
    title: "Spam-Safe Drip Sending",
    desc: "25–90 second random delays between emails. 10-minute cooldowns between batches. 400/day hard cap. Your Gmail account stays safe.",
  },
  {
    icon: Zap,
    title: "100 Leads in Minutes",
    desc: "Parallel AI lanes with automatic rate-limit backoff. What used to take a team a week ships in one coffee break.",
  },
  {
    icon: Mail,
    title: "Human-Sounding Emails",
    desc: "No slop. No filler. No 'I hope this email finds you well.' Four tight paragraphs: hook, gap, pitch, CTA. Written to get replies.",
  },
  {
    icon: BarChart2,
    title: "Full Send Analytics",
    desc: "Track sent today, this month, all time. Export send logs to CSV. Know exactly what went out and when.",
  },
  {
    icon: CheckCircle2,
    title: "Review Before You Send",
    desc: "Read every AI research note. Edit subject and body. Approve, skip, or redraft any lead individually. You stay in control.",
  },
];

const STEPS = [
  { icon: Upload, step: "01", label: "Import Leads", desc: "Drag-drop your CSV of businesses. Auto-detects name, email, city, category, phone, and rating columns." },
  { icon: Settings, step: "02", label: "Configure", desc: "Set your agency pitch, tone, CTA, and sender details. Pick which AI providers to use." },
  { icon: Wand2, step: "03", label: "AI Drafts", desc: "AI researches each business and writes a personalized 4-paragraph cold email. All in parallel." },
  { icon: Eye, step: "04", label: "Review", desc: "Read AI research, edit subject and body, approve or skip leads. Redraft any email in one click." },
  { icon: Send, step: "05", label: "Send", desc: "Drip-send in batches with human delays. One click handles everything — no babysitting required." },
];

const PROVIDERS = [
  { name: "Gemini Flash", badge: "Google", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "Llama 3.1 8B", badge: "Groq", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { name: "Llama 4 Scout", badge: "Groq", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { name: "Mistral 7B", badge: "Mistral", color: "bg-orange-50 text-orange-700 border-orange-200" },
  { name: "Llama 3.1 8B", badge: "Cerebras", color: "bg-violet-50 text-violet-700 border-violet-200" },
];

export default function LandingPage({ onGetStarted }) {
  return (
    <div className="min-h-screen bg-white font-sans">

      {/* Nav */}
      <header className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="OutreachOS" className="w-7 h-7" />
            <span className="font-bold text-gray-900">OutreachOS</span>
            <span className="text-[10px] bg-primary-light text-primary px-1.5 py-0.5 rounded font-semibold">BETA</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/mehetab-01/OutReachOS" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800 transition-colors hidden sm:block">GitHub</a>
            <Button className="bg-primary hover:bg-primary-dark text-sm h-8 px-4" onClick={onGetStarted}>
              Launch App
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-primary-light text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-purple-200">
          <Zap size={11} /> Built by Arcen Studio · Mumbai
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
          Cold email outreach,<br className="hidden sm:block" />
          <span className="text-primary"> done by AI.</span>
        </h1>
        <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
          Import your leads. AI researches every business, writes hyper-personalized emails, and drip-sends them at human pace — without risking your inbox.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            className="bg-primary hover:bg-primary-dark gap-2 text-base h-11 px-7"
            onClick={onGetStarted}
          >
            Start Free <ArrowRight size={16} />
          </Button>
          <a href="https://github.com/mehetab-01/OutReachOS" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 text-base h-11 px-7 w-full sm:w-auto">
              View on GitHub
            </Button>
          </a>
        </div>
        <p className="text-xs text-gray-400 mt-4">Sign in with Google · Self-hosted · MIT License</p>
      </section>

      {/* Screenshot hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-xl shadow-gray-100">
          <img
            src="/screenshots/04-review.png"
            alt="OutreachOS Review Screen — real AI-researched cold emails"
            className="w-full"
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 border-y border-gray-100 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Five steps. Zero manual work.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map(({ icon: Icon, step, label, desc }) => (
              <div key={step} className="bg-white rounded-xl p-5 border border-gray-200 flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-primary" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{step}</span>
                </div>
                <p className="font-semibold text-sm text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Everything your outreach needs</h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">Built for agencies and freelancers who need to reach local businesses at scale without sounding like a bot.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-gray-50 rounded-xl p-6 border border-gray-100 hover:border-primary-light hover:bg-primary-light/30 transition-all duration-200">
                <div className="w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center mb-4">
                  <Icon size={17} className="text-primary" />
                </div>
                <p className="font-semibold text-gray-900 mb-2">{title}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots strip */}
      <section className="bg-gray-50 border-y border-gray-100 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-2">In action</p>
            <h2 className="text-3xl font-bold text-gray-900">See the full flow</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { src: "/screenshots/01-import.png", label: "01 · Import 100 real leads" },
              { src: "/screenshots/02-configure.png", label: "02 · Configure your campaign" },
              { src: "/screenshots/03-generate.png", label: "03 · AI drafts all 100 in minutes" },
              { src: "/screenshots/04-review.png", label: "04 · Review AI research + email" },
              { src: "/screenshots/05-send.png", label: "05 · Send with stats + drip control" },
            ].map(({ src, label }) => (
              <div key={src} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                <img src={src} alt={label} className="w-full object-cover object-top max-h-48" />
                <p className="text-[11px] text-gray-500 font-medium px-3 py-2 border-t border-gray-100 bg-white">{label}</p>
              </div>
            ))}
            {/* Filler CTA card */}
            <div className="rounded-xl border border-dashed border-primary-light bg-primary-light/40 flex flex-col items-center justify-center p-8 gap-3">
              <Wand2 size={24} className="text-primary" />
              <p className="text-sm font-semibold text-primary text-center">Ready to run your first campaign?</p>
              <Button className="bg-primary hover:bg-primary-dark text-xs h-8 px-4 gap-1.5" onClick={onGetStarted}>
                Launch App <ArrowRight size={12} />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* AI Providers */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Powered by</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {PROVIDERS.map(({ name, badge, color }) => (
              <div key={name + badge} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${color}`}>
                <span className="font-bold">{badge}</span>
                <span className="text-gray-400">·</span>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">All models run in parallel with automatic rate-limit backoff. Bring your own API keys.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-primary py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Turn your lead list into booked calls.
          </h2>
          <p className="text-purple-200 text-lg mb-8 leading-relaxed">
            Import your CSV, hit Draft All, review, and send. AI handles the research and writing. You close the deals.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="bg-white text-primary hover:bg-purple-50 gap-2 text-base h-11 px-7 font-semibold"
              onClick={onGetStarted}
            >
              Launch OutreachOS <ArrowRight size={16} />
            </Button>
            <a href="https://github.com/mehetab-01/OutReachOS" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 text-base h-11 px-7 w-full sm:w-auto">
                Star on GitHub
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center text-white font-bold text-[10px]">O</div>
            <span>OutreachOS · Built by <a href="https://tabcrypt.in" className="text-primary hover:underline">Arcen Studio</a></span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/mehetab-01/OutReachOS" className="hover:text-gray-700 transition-colors">GitHub</a>
            <a href="https://tabcrypt.in" className="hover:text-gray-700 transition-colors">Arcen Studio</a>
            <span>MIT License</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
