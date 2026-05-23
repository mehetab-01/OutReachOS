import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const providers = JSON.parse(sessionStorage.getItem("ai_providers") || "[]");
  if (providers.length > 0) {
    config.headers["X-AI-Providers"] = JSON.stringify(providers);
    // legacy single-key compat
    const first = providers[0];
    if (first?.key) config.headers["X-Gemini-Key"] = first.key;
    if (first?.model) config.headers["X-Gemini-Model"] = first.model;
  }
  return config;
});

// Campaigns
export const createCampaign = (data) => api.post("/api/campaigns", data).then((r) => r.data);
export const listCampaigns = () => api.get("/api/campaigns").then((r) => r.data);
export const getCampaign = (id) => api.get(`/api/campaigns/${id}`).then((r) => r.data);

// Models
export const listModels = () => api.get("/api/models").then((r) => r.data);

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
export const stopDraftAll = (campaignId) =>
  api.post(`/api/campaigns/${campaignId}/draft-all/stop`).then((r) => r.data);
export const getDraftAllStatus = (campaignId) =>
  api.get(`/api/campaigns/${campaignId}/draft-all/status`).then((r) => r.data);
export const patchDraft = (draftId, data) =>
  api.patch(`/api/drafts/${draftId}`, data).then((r) => r.data);

// Send stats
export const getSendStats = (campaignId, smtpUser = "") =>
  api.get(`/api/campaigns/${campaignId}/send-stats`, { params: { smtp_user: smtpUser } }).then((r) => r.data);

// Batches
export const listBatches = (campaignId) =>
  api.get(`/api/campaigns/${campaignId}/batches`).then((r) => r.data);
export const createBatches = (campaignId, batchSize) =>
  api.post(`/api/campaigns/${campaignId}/batches`, { batch_size: batchSize }).then((r) => r.data);
export const sendBatch = (batchId, smtpConfig) =>
  api.post(`/api/batches/${batchId}/send`, smtpConfig).then((r) => r.data);
export const stopBatch = (batchId) =>
  api.post(`/api/batches/${batchId}/stop`).then((r) => r.data);
export const getBatchStatus = (batchId) =>
  api.get(`/api/batches/${batchId}/status`).then((r) => r.data);
export const deleteBatch = (batchId) =>
  api.delete(`/api/batches/${batchId}`).then((r) => r.data);
export const getSendLog = (campaignId) =>
  api.get(`/api/campaigns/${campaignId}/sendlog`).then((r) => r.data);
