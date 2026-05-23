import { useState } from "react";
import { Building2, MessageSquare, Key, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useApp } from "../context/AppContext";
import { createCampaign, uploadLeads } from "../lib/api";
import { useToast } from "../components/ui/use-toast";

const TONES = ["Professional", "Conversational", "Direct"];

export default function ConfigureScreen() {
  const { campaignForm, setCampaignForm, rawLeads, setCampaign, setLeads, setScreen } = useApp();
  const [showApiKey, setShowApiKey] = useState(false);
  const [geminiKey, setGeminiKey] = useState(sessionStorage.getItem("gemini_key") || "");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const update = (key, val) => setCampaignForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setLoading(true);
    try {
      if (geminiKey) sessionStorage.setItem("gemini_key", geminiKey);

      const camp = await createCampaign(campaignForm);
      setCampaign(camp);

      if (rawLeads.length > 0) {
        const uploaded = await uploadLeads(camp.id, rawLeads);
        setLeads(uploaded);
      }

      setScreen("generate");
    } catch (err) {
      toast({ title: "Error saving campaign", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, fieldKey, type = "input", rows = 4 }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {type === "input" ? (
        <Input
          value={campaignForm[fieldKey] || ""}
          onChange={(e) => update(fieldKey, e.target.value)}
          className="text-sm"
        />
      ) : (
        <Textarea
          rows={rows}
          value={campaignForm[fieldKey] || ""}
          onChange={(e) => update(fieldKey, e.target.value)}
          className="text-sm resize-none"
        />
      )}
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campaign Config</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {rawLeads.length} leads imported. Set up your outreach campaign.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Agency details */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Building2 size={15} className="text-primary" /> Agency Details
          </p>

          <Field label="Campaign Name" fieldKey="name" />
          <Field label="Sender Name" fieldKey="sender_name" />
          <Field label="Reply-To Email" fieldKey="sender_email" />
          <Field label="CTA Text" fieldKey="cta" />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">Subject Line Template</label>
            <Input
              value={campaignForm.subjectTemplate || ""}
              onChange={(e) => update("subjectTemplate", e.target.value)}
              placeholder="Your {category} business in {city} — quick question"
              className="text-sm"
            />
            <div className="flex gap-1.5 flex-wrap mt-1">
              {["{business_name}", "{city}", "{category}"].map((v) => (
                <span
                  key={v}
                  className="text-[10px] font-mono bg-primary-light text-primary px-2 py-0.5 rounded cursor-pointer hover:opacity-80"
                  onClick={() => update("subjectTemplate", (campaignForm.subjectTemplate || "") + v)}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500">Email Tone</label>
            <div className="flex gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => update("tone", t)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150
                    ${campaignForm.tone === t
                      ? "border-primary bg-primary-light text-primary"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* API Key override */}
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={() => setShowApiKey((p) => !p)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Key size={12} />
              Gemini API Key Override
              {showApiKey ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showApiKey && (
              <div className="mt-2 animate-fade-in">
                <Input
                  type="password"
                  placeholder="AIza..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="text-sm font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Overrides the server .env key for this session only.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Pitch */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <p className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-primary" /> Agency Pitch (AI context)
          </p>
          <Field label="What Arcen does" fieldKey="pitch" type="textarea" rows={7} />
          <Field label="Services (comma separated)" fieldKey="services" type="textarea" rows={5} />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={loading}
          className="bg-primary hover:bg-primary-dark gap-2"
        >
          {loading ? "Saving…" : (
            <>Save & Continue <ArrowRight size={14} /></>
          )}
        </Button>
      </div>
    </div>
  );
}
