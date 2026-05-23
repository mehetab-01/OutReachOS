import { useState, useEffect } from "react";
import {
  Building2, MessageSquare, Key, ChevronDown, ChevronUp,
  ArrowRight, Plus, Trash2, CheckCircle, Cpu,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useApp } from "../context/AppContext";
import { createCampaign, uploadLeads, listModels } from "../lib/api";
import { useToast } from "../components/ui/use-toast";

const TONES = ["Professional", "Conversational", "Direct"];

const DEFAULT_MODELS = [
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Fastest)" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (Cheapest)" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Best Quality)" },
  { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash Preview" },
];

export default function ConfigureScreen() {
  const { campaignForm, setCampaignForm, rawLeads, setCampaign, setLeads, setScreen } = useApp();
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const { toast } = useToast();

  // Multi-key state — array of { id, value, label }
  const [geminiKeys, setGeminiKeys] = useState(() => {
    const saved = JSON.parse(sessionStorage.getItem("gemini_keys") || "[]");
    return saved.length > 0
      ? saved.map((k, i) => ({ id: i, value: k, label: `Key ${i + 1}` }))
      : [{ id: 0, value: "", label: "Key 1" }];
  });
  const [selectedModel, setSelectedModel] = useState(
    sessionStorage.getItem("gemini_model") || "gemini-2.0-flash"
  );

  useEffect(() => {
    listModels().then(setModels).catch(() => {});
  }, []);

  const update = (key, val) => setCampaignForm((p) => ({ ...p, [key]: val }));

  const addKey = () => {
    const nextId = Date.now();
    setGeminiKeys((prev) => [
      ...prev,
      { id: nextId, value: "", label: `Key ${prev.length + 1}` },
    ]);
  };

  const removeKey = (id) => {
    setGeminiKeys((prev) => {
      const next = prev.filter((k) => k.id !== id).map((k, i) => ({ ...k, label: `Key ${i + 1}` }));
      return next.length > 0 ? next : [{ id: Date.now(), value: "", label: "Key 1" }];
    });
  };

  const updateKey = (id, value) => {
    setGeminiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, value } : k)));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const validKeys = geminiKeys.map((k) => k.value.trim()).filter(Boolean);
      sessionStorage.setItem("gemini_keys", JSON.stringify(validKeys));
      sessionStorage.setItem("gemini_model", selectedModel);

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

  const validKeyCount = geminiKeys.filter((k) => k.value.trim()).length;

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

          {/* AI Config collapsible */}
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={() => setShowAiConfig((p) => !p)}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full"
            >
              <Key size={12} />
              <span>AI Configuration</span>
              {validKeyCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium flex items-center gap-1">
                  <CheckCircle size={9} /> {validKeyCount} key{validKeyCount > 1 ? "s" : ""}
                </span>
              )}
              <span className="ml-auto">
                {showAiConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            </button>

            {showAiConfig && (
              <div className="mt-4 space-y-4 animate-fade-in">
                {/* Model selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Cpu size={11} /> Gemini Model
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`text-left px-3 py-2 rounded-lg text-xs border transition-all duration-150
                          ${selectedModel === m.id
                            ? "border-primary bg-primary-light text-primary font-medium"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                          }`}
                      >
                        <span className="font-mono">{m.id}</span>
                        <span className="ml-2 text-gray-400 font-normal">— {m.label.split("(")[1]?.replace(")", "") || ""}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Multi-key pool */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                      <Key size={11} /> API Keys
                      <span className="text-gray-400 font-normal">(rotated round-robin)</span>
                    </label>
                    <button
                      onClick={addKey}
                      className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-dark transition-colors font-medium"
                    >
                      <Plus size={10} /> Add Key
                    </button>
                  </div>

                  <div className="space-y-2">
                    {geminiKeys.map((k) => (
                      <div key={k.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-10 shrink-0">{k.label}</span>
                        <Input
                          type="password"
                          placeholder="AIza..."
                          value={k.value}
                          onChange={(e) => updateKey(k.id, e.target.value)}
                          className="text-sm font-mono flex-1"
                        />
                        {geminiKeys.length > 1 && (
                          <button
                            onClick={() => removeKey(k.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-gray-400">
                    Add multiple keys to distribute API calls across accounts. Keys override server .env for this session.
                  </p>
                </div>
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
