import { useState, useEffect, useRef } from "react";
import {
  Building2, MessageSquare, Key, ChevronDown, ChevronUp,
  ArrowRight, Plus, Trash2, GripVertical, AlertCircle,
  CheckCircle2, Zap,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useApp } from "../context/AppContext";
import { createCampaign, uploadLeads, listModels } from "../lib/api";
import { useToast } from "../components/ui/use-toast";

const TONES = ["Professional", "Conversational", "Direct"];

const PROVIDER_META = {
  gemini:     { label: "Google Gemini",        color: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  groq:       { label: "Groq (Ultra-fast)",    color: "bg-green-50 text-green-700 border-green-200",  dot: "bg-green-500" },
  cerebras:   { label: "Cerebras (Free·Fast)", color: "bg-cyan-50 text-cyan-700 border-cyan-200",     dot: "bg-cyan-500" },
  mistral:    { label: "Mistral AI (Free)",    color: "bg-yellow-50 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" },
  openrouter: { label: "OpenRouter (Free)",    color: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  claude:     { label: "Anthropic Claude",     color: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
};

const DEFAULT_MODELS_BY_PROVIDER = {
  gemini: [
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", note: "1K/day · 15 RPM · fastest free" },
    { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      note: "250/day · 10 RPM · best quality" },
    { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash",      note: "100/day · 5 RPM" },
    { id: "gemini-flash-latest",   label: "Gemini Flash Latest",   note: "Always latest" },
  ],
  groq: [
    { id: "llama-3.1-8b-instant",                     label: "Llama 3.1 8B",      note: "14.4K/day · 30 RPM · best quota" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", note: "1K/day · 30 RPM · 30K TPM" },
    { id: "llama-3.3-70b-versatile",                  label: "Llama 3.3 70B",     note: "1K/day · best quality" },
    { id: "qwen/qwen3-32b",                           label: "Qwen3 32B",         note: "1K/day · 60 RPM" },
  ],
  cerebras: [
    { id: "llama-3.1-8b",  label: "Llama 3.1 8B",  note: "1M tok/day · 5 RPM · free" },
    { id: "llama-3.3-70b", label: "Llama 3.3 70B", note: "1M tok/day · 5 RPM · free" },
    { id: "llama-4-scout", label: "Llama 4 Scout",  note: "1M tok/day · 5 RPM · free" },
  ],
  mistral: [
    { id: "mistral-small-latest", label: "Mistral Small", note: "Free tier · fast" },
    { id: "open-mistral-7b",      label: "Mistral 7B",    note: "Free tier" },
    { id: "open-mixtral-8x7b",    label: "Mixtral 8x7B",  note: "Free tier" },
  ],
  openrouter: [
    { id: "deepseek/deepseek-r1:free",             label: "DeepSeek R1",   note: "Free · high quality" },
    { id: "deepseek/deepseek-v3-base:free",        label: "DeepSeek V3",   note: "Free" },
    { id: "mistralai/mistral-7b-instruct:free",    label: "Mistral 7B",    note: "Free" },
    { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B", note: "Free" },
    { id: "qwen/qwen3-8b:free",                    label: "Qwen3 8B",      note: "Free" },
  ],
  claude: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",  note: "Paid · fastest" },
    { id: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6", note: "Paid · recommended" },
  ],
};

const KEY_PLACEHOLDERS = {
  gemini:     "AIza...",
  groq:       "gsk_...",
  cerebras:   "csk-...",
  mistral:    "your_mistral_key...",
  openrouter: "sk-or-...",
  claude:     "sk-ant-...",
};

const PROVIDER_DEFAULT_MODEL = {
  gemini:     "gemini-2.0-flash-lite",
  groq:       "llama-3.1-8b-instant",
  cerebras:   "llama-3.1-8b",
  mistral:    "mistral-small-latest",
  openrouter: "deepseek/deepseek-r1:free",
  claude:     "claude-haiku-4-5-20251001",
};

function newEntry(provider = "gemini") {
  return {
    id: Date.now() + Math.random(),
    provider,
    model: PROVIDER_DEFAULT_MODEL[provider] || DEFAULT_MODELS_BY_PROVIDER[provider][0].id,
    key: "",
  };
}

export default function ConfigureScreen() {
  const { campaignForm, setCampaignForm, rawLeads, setCampaign, setLeads, setScreen } = useApp();
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverModels, setServerModels] = useState(null);
  const { toast } = useToast();

  // Priority-ordered provider entries
  const [providers, setProviders] = useState(() => {
    const saved = JSON.parse(sessionStorage.getItem("ai_providers") || "[]");
    if (saved.length > 0) return saved.map((p) => ({ ...p, id: Date.now() + Math.random() }));
    return [newEntry("gemini")];
  });

  // Drag state
  const dragIdx = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    listModels()
      .then((data) => setServerModels(data))
      .catch(() => {});
  }, []);

  const update = (key, val) => setCampaignForm((p) => ({ ...p, [key]: val }));

  const modelsFor = (provider) =>
    serverModels?.providers?.[provider]?.models || DEFAULT_MODELS_BY_PROVIDER[provider] || [];

  const updateEntry = (id, field, val) =>
    setProviders((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              [field]: val,
              // auto-reset model when provider changes
              ...(field === "provider"
                ? { model: PROVIDER_DEFAULT_MODEL[val] || (DEFAULT_MODELS_BY_PROVIDER[val] || [])[0]?.id || "" }
                : {}),
            }
          : p
      )
    );

  const removeEntry = (id) =>
    setProviders((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next.length > 0 ? next : [newEntry("gemini")];
    });

  // Drag-to-reorder
  const onDragStart = (idx) => { dragIdx.current = idx; };
  const onDragEnter = (idx) => setDragOver(idx);
  const onDragEnd = () => {
    if (dragIdx.current !== null && dragOver !== null && dragIdx.current !== dragOver) {
      setProviders((prev) => {
        const arr = [...prev];
        const [item] = arr.splice(dragIdx.current, 1);
        arr.splice(dragOver, 0, item);
        return arr;
      });
    }
    dragIdx.current = null;
    setDragOver(null);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const validProviders = providers.filter((p) => p.key.trim() || p.provider === "openrouter");
      sessionStorage.setItem("ai_providers", JSON.stringify(
        providers.map(({ id: _, ...rest }) => rest)
      ));

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

  const configuredCount = providers.filter((p) => p.key.trim()).length;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Campaign Config</h1>
        <p className="text-gray-500 mt-2 text-sm">
          {rawLeads.length} leads imported. Set up your outreach campaign.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <Zap size={12} />
              <span className="font-medium">AI Providers & Priority</span>
              {configuredCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium flex items-center gap-1">
                  <CheckCircle2 size={9} /> {configuredCount} configured
                </span>
              )}
              {configuredCount === 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium flex items-center gap-1">
                  <AlertCircle size={9} /> no keys set
                </span>
              )}
              <span className="ml-auto">
                {showAiConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            </button>

            {showAiConfig && (
              <div className="mt-4 animate-fade-in space-y-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Add providers in priority order — the first one with a valid key is used. If it fails after retries, the next kicks in.
                  <span className="font-medium text-gray-500"> Drag</span> rows to reorder.
                </p>

                {/* Priority list */}
                <div className="space-y-2">
                  {providers.map((entry, idx) => {
                    const meta = PROVIDER_META[entry.provider] || PROVIDER_META.gemini;
                    const models = modelsFor(entry.provider);
                    const isDraggingOver = dragOver === idx;

                    return (
                      <div
                        key={entry.id}
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        onDragEnter={() => onDragEnter(idx)}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`border rounded-lg p-3 bg-white transition-all duration-150 ${
                          isDraggingOver
                            ? "border-primary shadow-md scale-[1.01]"
                            : "border-gray-200"
                        }`}
                      >
                        {/* Row header */}
                        <div className="flex items-center gap-2 mb-2">
                          <GripVertical
                            size={14}
                            className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
                          />
                          <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                            {idx + 1}
                          </span>

                          {/* Provider selector */}
                          <select
                            value={entry.provider}
                            onChange={(e) => updateEntry(entry.id, "provider", e.target.value)}
                            className={`text-xs font-medium border rounded-md px-2 py-1 ${meta.color} cursor-pointer focus:outline-none`}
                          >
                            {Object.entries(PROVIDER_META).map(([id, m]) => (
                              <option key={id} value={id}>{m.label}</option>
                            ))}
                          </select>

                          {/* Model selector */}
                          <select
                            value={entry.model}
                            onChange={(e) => updateEntry(entry.id, "model", e.target.value)}
                            className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:outline-none focus:border-primary bg-white cursor-pointer"
                          >
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}{m.note ? ` — ${m.note}` : ""}
                              </option>
                            ))}
                          </select>

                          {/* Remove */}
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* API Key input */}
                        <div className="flex items-center gap-2 pl-8">
                          <Key size={11} className="text-gray-300 shrink-0" />
                          <Input
                            type="password"
                            placeholder={KEY_PLACEHOLDERS[entry.provider] || "API Key..."}
                            value={entry.key}
                            onChange={(e) => updateEntry(entry.id, "key", e.target.value)}
                            className="text-xs font-mono flex-1 h-7"
                          />
                          {entry.key.trim() && (
                            <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add provider button */}
                <div className="flex gap-2 flex-wrap pt-1">
                  {Object.entries(PROVIDER_META).map(([id, m]) => (
                    <button
                      key={id}
                      onClick={() => setProviders((prev) => [...prev, newEntry(id)])}
                      className={`flex items-center gap-1 text-[10px] font-medium border rounded-md px-2 py-1 ${m.color} hover:opacity-80 transition-opacity`}
                    >
                      <Plus size={9} /> {m.label}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-gray-400">
                  Keys stored in sessionStorage only — never sent to our servers or logged.
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
          {loading ? "Saving…" : <><span>Save & Continue</span> <ArrowRight size={14} /></>}
        </Button>
      </div>
    </div>
  );
}
