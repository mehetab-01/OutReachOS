import { useApp } from "../context/AppContext";
import { Upload, Settings, Zap, Eye, Send, ChevronRight } from "lucide-react";

const STEPS = [
  { id: "import", label: "Import", icon: Upload, step: "01" },
  { id: "configure", label: "Configure", icon: Settings, step: "02" },
  { id: "generate", label: "Generate", icon: Zap, step: "03" },
  { id: "review", label: "Review", icon: Eye, step: "04" },
  { id: "send", label: "Send", icon: Send, step: "05" },
];

const SCREEN_ORDER = ["import", "configure", "generate", "review", "send"];

export default function TopNav() {
  const { screen, setScreen, leads } = useApp();
  const currentIdx = SCREEN_ORDER.indexOf(screen);
  const sentCount = leads.filter((l) => l.draft?.status === "sent").length;

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 flex items-center gap-3 sm:gap-6 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          <span className="font-bold text-sm tracking-tight hidden sm:block">OutreachOS</span>
          <span className="text-[10px] font-semibold text-primary bg-primary-light px-2 py-0.5 rounded-full hidden sm:block">
            BETA
          </span>
        </div>

        {/* Steps — icon-only on mobile, full on desktop */}
        <nav className="flex items-center gap-0.5 sm:gap-1 flex-1 overflow-x-auto no-scrollbar">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = screen === step.id;
            const isCompleted = idx < currentIdx;
            const isClickable = idx <= currentIdx || leads.length > 0;

            return (
              <button
                key={step.id}
                onClick={() => isClickable && setScreen(step.id)}
                className={`
                  flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 shrink-0
                  ${isActive
                    ? "bg-primary-light text-primary font-semibold"
                    : isCompleted
                    ? "text-gray-500 hover:bg-gray-100 cursor-pointer"
                    : isClickable
                    ? "text-gray-400 hover:bg-gray-50 cursor-pointer"
                    : "text-gray-300 cursor-default"
                  }
                `}
              >
                <span className={`text-[10px] font-bold hidden sm:block ${isActive ? "text-primary" : "text-gray-400"}`}>
                  {step.step}
                </span>
                <Icon size={13} />
                <span className="hidden sm:block">{step.label}</span>
                {idx < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-gray-300 ml-0.5 hidden sm:block" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Stats */}
        {leads.length > 0 && (
          <div className="text-xs text-gray-400 shrink-0 hidden sm:block">
            {leads.length} leads · {sentCount} sent
          </div>
        )}
      </div>
    </div>
  );
}
