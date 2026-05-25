import axios from "axios";
import { getIdToken } from "./firebase";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  // Attach Firebase ID token
  const token = await getIdToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;

  // Attach AI provider config from session
  const providers = JSON.parse(sessionStorage.getItem("ai_providers") || "[]");
  if (providers.length > 0) {
    config.headers["X-AI-Providers"] = JSON.stringify(providers);
    const first = providers[0];
    if (first?.key) config.headers["X-Gemini-Key"] = first.key;
    if (first?.model) config.headers["X-Gemini-Model"] = first.model;
  }
  return config;
});

// Campaigns
export const createCampaign = (data) => api.post("/campaigns", data).then((r) => r.data);
export const listCampaigns = () => api.get("/campaigns").then((r) => r.data);
export const getCampaign = (id) => api.get(`/campaigns/${id}`).then((r) => r.data);

// Models
export const listModels = () => api.get("/models").then((r) => r.data);

// Leads
export const uploadLeads = (campaignId, leads) =>
  api.post(`/campaigns/${campaignId}/leads`, leads).then((r) => r.data);
export const getLeads = (campaignId) =>
  api.get(`/campaigns/${campaignId}/leads`).then((r) => r.data);

// Drafts
export const draftSingle = (leadId) =>
  api.post(`/leads/${leadId}/draft`).then((r) => r.data);
export const draftAll = (campaignId) =>
  api.post(`/campaigns/${campaignId}/draft-all`).then((r) => r.data);
export const stopDraftAll = (campaignId) =>
  api.post(`/campaigns/${campaignId}/draft-all/stop`).then((r) => r.data);
export const getDraftAllStatus = (campaignId) =>
  api.get(`/campaigns/${campaignId}/draft-all/status`).then((r) => r.data);
export const patchDraft = (draftId, data) =>
  api.patch(`/drafts/${draftId}`, data).then((r) => r.data);

// Send stats
export const getSendStats = (campaignId, smtpUser = "") =>
  api.get(`/campaigns/${campaignId}/send-stats`, { params: { smtp_user: smtpUser } }).then((r) => r.data);

// Batches
export const listBatches = (campaignId) =>
  api.get(`/campaigns/${campaignId}/batches`).then((r) => r.data);
export const createBatches = (campaignId, batchSize) =>
  api.post(`/campaigns/${campaignId}/batches`, { batch_size: batchSize }).then((r) => r.data);
export const sendBatch = (batchId, smtpConfig) =>
  api.post(`/batches/${batchId}/send`, smtpConfig).then((r) => r.data);
export const stopBatch = (batchId) =>
  api.post(`/batches/${batchId}/stop`).then((r) => r.data);
export const getBatchStatus = (batchId) =>
  api.get(`/batches/${batchId}/status`).then((r) => r.data);
export const deleteBatch = (batchId) =>
  api.delete(`/batches/${batchId}`).then((r) => r.data);
export const getSendLog = (campaignId) =>
  api.get(`/campaigns/${campaignId}/sendlog`).then((r) => r.data);
export const sendAllBatches = (campaignId, smtpConfig) =>
  api.post(`/campaigns/${campaignId}/batches/send-all`, smtpConfig).then((r) => r.data);
