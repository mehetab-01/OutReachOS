<div align="center">

# OutreachOS

**AI-powered cold email automation for web development agencies**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Gemini](https://img.shields.io/badge/Gemini-1.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/license-MIT-purple?style=flat-square)](LICENSE)

*Built by [Arcen Studio](https://arcenstudio.com) · Mumbai, India*

</div>

---

## What is OutreachOS?

OutreachOS turns a CSV of business leads into personalized cold emails in minutes. Upload your list of businesses without websites, let Gemini AI research each one and write a tailored email, review every draft before it goes out, then send via Gmail — all in a clean 5-step flow anyone can use.

**Built for Arcen Studio's outreach workflow. Zero manual copy-pasting. Zero generic emails.**

---

## The 5-Step Flow

```
📥 Import CSV  →  ⚙️ Configure  →  🤖 AI Draft  →  👁 Review  →  📨 Send
```

| Step | What happens |
|------|-------------|
| **01 Import** | Drag-drop your CSV, preview leads, flag missing emails |
| **02 Configure** | Set campaign name, tone, CTA, agency pitch |
| **03 Generate** | Gemini researches each business + writes a personalized email |
| **04 Review** | Edit subject/body per lead, approve or skip |
| **05 Send** | Gmail SMTP with anti-spam delays, real-time log |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Tailwind CSS + shadcn/ui + Lucide |
| Backend | FastAPI (Python 3.11) + SQLAlchemy |
| AI | Gemini 1.5 Flash (Google AI) |
| Database | SQLite (persistent Docker volume) |
| Email | smtplib — Gmail SMTP + App Password |
| Deploy | Docker Compose + Caddy + Cloudflare Tunnel |

---

## Prerequisites

Before you start, you need:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — to run the app
- **[Gemini API key](https://aistudio.google.com/)** — free tier works fine for most campaigns
- **Gmail App Password** — a special password just for OutreachOS (not your real Gmail password)

---

## Setup Guide

### Step 1 — Get your Gemini API key

1. Go to **[aistudio.google.com](https://aistudio.google.com/)**
2. Click **Get API key** → **Create API key in new project**
3. Copy the key (starts with `AIza...`)

### Step 2 — Create a Gmail App Password

> This is a one-time setup. You'll use this password in OutreachOS instead of your Gmail password.

1. Go to **[myaccount.google.com/security](https://myaccount.google.com/security)**
2. Under *How you sign in to Google*, click **2-Step Verification** and enable it
3. Search for **App passwords** (top search bar)
4. Select app: **Mail** · Select device: **Other** → type `OutreachOS`
5. Click **Generate** → copy the 16-character password (e.g. `abcd efgh ijkl mnop`)

### Step 3 — Run OutreachOS

```bash
# 1. Clone the repo
git clone https://github.com/mehetab-01/outreachos.git
cd outreachos

# 2. Copy the example env file
cp .env.example .env

# 3. Open .env in any text editor and fill in your keys
#    GEMINI_API_KEY=AIza...
#    SMTP_USER=your@gmail.com
#    SMTP_PASS=abcd efgh ijkl mnop

# 4. Start everything
docker compose up --build
```

5. Open **[http://localhost:3000](http://localhost:3000)** in your browser ✅

> **First run takes ~3 minutes** while Docker downloads and builds the images. After that, `docker compose up` starts in seconds.

---

## Running a Campaign (Soham's Guide)

> You don't need to touch any code. Just follow these steps every time.

### Step 1 — Import your leads

- Open OutreachOS at **http://localhost:3000**
- Drag your CSV file onto the upload area, or click **Load 5 sample leads** to test first
- Check the preview table — rows highlighted in **red** have a missing email address
- Click **Confirm & Continue**

### Step 2 — Configure your campaign

- Check the campaign name and your reply-to email
- Adjust the **CTA** if needed (what you want them to do — e.g. "a 5-minute call")
- Pick a **tone**: *Conversational* works best for most small businesses
- Click **Save & Continue**

### Step 3 — Let AI draft the emails

- Click **Draft All X Leads** — Gemini will research each business and write a personalized email
- The status of each lead changes: `Pending → Drafting… → Drafted`
- Takes about **10–15 seconds per lead**
- Click **View Drafts** when you see progress finish

### Step 4 — Review every email

- Click each business name in the left sidebar to open their email
- Read the purple **AI Research** box — this is what Gemini found about their online presence
- Edit the **Subject** or **Body** directly if anything needs tweaking
- Click **Approve** for emails you're happy with, **Skip** to exclude
- Use **Approve All Drafted** to approve everything at once when you're satisfied

### Step 5 — Send

- Your Gmail credentials are usually already filled in from the server
- Check the stats: Approved count should match what you expect
- Click **Send X Emails Now**
- Watch the **real-time send log** — each sent email appears as it goes out
- Click **Export CSV** to save the send log for your records

---

## CSV Format

Your CSV file should have these columns. Header names are flexible — OutreachOS detects common variations automatically.

| Column | Also recognized as | Required |
|--------|-------------------|----------|
| `name` | `business_name` | ✅ Yes |
| `email` | `emails`, `email_address` | ✅ Yes |
| `city` | `location` | ✅ Yes |
| `business_category` | `category`, `type` | ✅ Yes |
| `phone_number` | `phone`, `contact` | Optional |
| `facebook` | `facebook_url`, `fb` | Optional |
| `review_score` | `rating`, `stars` | Optional |

**Example row:**
```csv
name,email,city,business_category,phone_number,review_score
Rustic Scruff Grooming,hello@rusticscruff.com,"Coal City, IL",pet_groomer,+1 815-518-5153,4.9
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (React 18)                │
│   Import → Configure → Generate → Review → Send     │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (axios)
┌──────────────────────▼──────────────────────────────┐
│              FastAPI Backend (Python 3.11)           │
│                                                      │
│  /api/campaigns    /api/leads     /api/drafts        │
│  /api/campaigns/{id}/draft-all   /api/{id}/send      │
└────────┬──────────────────────┬───────────────────── ┘
         │ SQLAlchemy           │ google-generativeai
┌────────▼────────┐    ┌────────▼────────────────────┐
│  SQLite (Docker │    │  Gemini 1.5 Flash            │
│  named volume)  │    │  gemini-1.5-flash model      │
└─────────────────┘    └─────────────────────────────┘
```

**Docker Compose services:**
- `backend` — FastAPI on port 8000, SQLite on `/app/db` volume
- `frontend` — React build served by nginx on port 3000
- `caddy` — Reverse proxy with auto-HTTPS (for your domain / Cloudflare Tunnel)

---

## Deploying with Cloudflare Tunnel (Homelab)

If you're running this on a homelab server and want to access it from anywhere:

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/) on your server
2. Create a tunnel pointing to `http://localhost:80`
3. Update `Caddyfile` — replace `outreach.yourdomain.com` with your tunnel hostname
4. Run `docker compose up -d`

---

## Troubleshooting

**"No Gemini API key available"**
```
→ Open .env and check GEMINI_API_KEY is filled in (not the placeholder)
→ Run: docker compose restart backend
```

**"Gmail authentication failed" or SMTP error**
```
→ You must use an App Password, not your regular Gmail password
→ Regular passwords stopped working for SMTP in 2022
→ Re-generate your App Password at myaccount.google.com/apppasswords
```

**Emails going to spam**
```
→ The 3–8 second delay between sends is already built in
→ Make sure your subject line contains the business name (Gemini does this by default)
→ Avoid sending more than 100 emails/day from a fresh Gmail account
→ Warm up your sending address before large campaigns
```

**Drafts stuck on "Drafting…"**
```
→ Check backend logs: docker compose logs backend --tail=50
→ Usually a Gemini API rate limit — wait 60 seconds and click Retry on the stuck lead
→ Free Gemini tier: 15 requests/minute — for large batches use a paid key
```

**"No approved drafts to send"**
```
→ Go back to Review screen and click Approve on the emails you want to send
```

---

## Phase 2 Roadmap

These features are planned for after the MVP:

- [ ] **Open/click tracking** — pixel + link wrapper to track engagement
- [ ] **Reply detection** — IMAP polling to detect replies automatically
- [ ] **Follow-up sequences** — automated Day 3, Day 7 follow-ups
- [ ] **CRM board** — Kanban: Contacted → Replied → Call Booked → Won
- [ ] **Multi-provider AI** — Grok, Claude fallback if Gemini is down
- [ ] **Domain warm-up advisor** — guidance on safe send volumes
- [ ] **LinkedIn outreach** — extend beyond email

---

## Project Structure

```
OutreachOS/
├── backend/
│   ├── main.py          # FastAPI app — all 10 API endpoints
│   ├── models.py        # SQLAlchemy ORM — Campaign, Lead, Draft, SendLog
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── ai.py            # Gemini 1.5 Flash integration with retry
│   ├── email_sender.py  # smtplib STARTTLS sender with anti-spam delay
│   ├── database.py      # SQLite engine + session factory
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── screens/     # ImportScreen, ConfigureScreen, GenerateScreen,
│   │   │                #   ReviewScreen, SendScreen
│   │   ├── components/  # TopNav, StatusBadge, shadcn-style UI components
│   │   ├── context/     # AppContext — global state
│   │   └── lib/         # api.js (axios), utils.js (helpers)
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
├── Caddyfile
├── .env.example
└── README.md
```

---

## Built by

**[Arcen Studio](https://arcenstudio.com)** — Mumbai, India

> Mehetab Ali (CTO) · Soham Sawant (CEO)
>
> We build custom websites, full-stack apps, and AI-powered digital products.
> Every project ships with a 95+ Lighthouse score and 30 days post-launch support.

---

<div align="center">

*OutreachOS is an internal tool. Use responsibly — personalize, delay, and respect unsubscribe requests.*

</div>
