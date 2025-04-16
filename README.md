# gcal-api

Simple Node.js app using the Google Calendar API and Notion API.

## Features

### Google Calendar
- 📅 List calendar events
- 📝 Create new events
- 🌱 Generate events from emotional intentions
- 🔐 Uses OAuth2 (`token.json`)

### Notion
- 📂 Fetch block/page contents
- 🔄 Recursively retrieve nested blocks

## Setup

1. Download `credentials.json` from Google Cloud Console.
2. Create a `.env` file:
   ```
   NOTION_TOKEN=secret_abc123...
   OPENAI_API_KEY=sk-...
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## API (via Express)

### 🔹 Google Calendar
| Method | Route                               | Description                        |
| ------ | ----------------------------------- | ---------------------------------- |
| GET    | `/events`                           | List primary calendar events       |
| GET    | `/events/monthly?year=2025&month=4` | Events for specific month          |
| GET    | `/events/:calendarId`               | Events from a specific calendar    |
| POST   | `/events`                           | Create a new event                 |
| POST   | `/intentions`                       | Create a gentle event from feeling |
| GET    | `/calendars`                        | List all calendars                 |

### 🧠 Notion
| Method | Route                       | Description                        |
| ------ | --------------------------- | ---------------------------------- |
| GET    | `/notion/:blockId/children` | List direct children of a block    |
| GET    | `/notion/:blockId/all`      | Recursively retrieve nested blocks |
