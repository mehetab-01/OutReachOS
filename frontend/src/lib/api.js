import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const key = sessionStorage.getItem("gemini_key");
  if (key) config.headers["X-Gemini-Key"] = key;
  return config;
});

// Campaigns
export const createCampaign = (data) => api.post("/api/campaigns", data).then((r) => r.data);
export const listCampaigns = () => api.get("/api/campaigns").then((r) => r.data);
export const getCampaign = (id) => api.get(`/api/campaigns/${id}`).then((r) => r.data);

// Leads
export const uploadLeads = (campaignId, leads) =>
  api.post(`/api/campaigns/${campaignId}/leads`, leads).then((r) => r.data);
export const getLeads = (campaignId) =>
  api.get(`/api/campaigns/${campaignId}/leads`).then((r) => r.data);

// Drafts
export const draftSingle = (leadId) =>
  api.post(`/api/leads/${leadId}/draft`).then((r) => r.data);
export const draftAll = (campaignId) =>
  api.post(`/api/campaigns/${campaignId}/draft-all`).then((r) => r.data);
export const patchDraft = (draftId, data) =>
  api.patch(`/api/drafts/${draftId}`, data).then((r) => r.data);

// Send
export const sendCampaign = (campaignId, smtpConfig) =>
  api.post(`/api/campaigns/${campaignId}/send`, smtpConfig).then((r) => r.data);
export const getSendLog = (campaignId) =>
  api.get(`/api/campaigns/${campaignId}/sendlog`).then((r) => r.data);
