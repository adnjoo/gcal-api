# 🧠 gcal-api

*Your feelings. Your focus. On the calendar.*
A tiny emotional productivity API that connects Google Calendar, Notion, and OpenAI — so you can **turn vibes into action**.

---

## ✨ Features

### 📅 Google Calendar Integration

* `GET /events` — List all primary calendar events
* `GET /events/monthly?year=2025&month=4` — Pull events for a specific month
* `GET /events/:calendarId` — Fetch events from any calendar
* `POST /events` — Create new events
* `POST /intentions` — **Turn a raw feeling into a gentle, supportive calendar entry**
* `GET /calendars` — List all accessible calendars

### 🧠 Notion Integration

* `GET /notion/:blockId/children` — Fetch direct children of a block
* `GET /notion/:blockId/all` — Recursively fetch every nested block, page, and sub-thought

---

## 🛠 Setup

1. **Google Calendar Auth**

   * Get your `credentials.json` from [Google Cloud Console](https://console.cloud.google.com/)
   * Run the server and authenticate to generate `token.json`

2. **Environment Variables**
   Create a `.env` file with:

   ```
   NOTION_TOKEN=secret_abc123...
   OPENAI_API_KEY=sk-...
   ```

3. **Install & Run**

   ```bash
   npm install
   npm run dev
   ```

---

## 🔗 Built With

* Node.js + Express
* Google Calendar API
* Notion API
* OpenAI (for `/intentions`)

---

## 💡 Why?

Because your calendar should listen to your **inner world**, not just your deadlines.
Build emotional awareness into your workflow. One endpoint at a time.
