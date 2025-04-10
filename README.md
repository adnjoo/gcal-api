# test

Simple Node.js app using the Google Calendar API.

## Features
- 📅 List calendar events
- 📝 Create new events
- 🔐 Uses OAuth2 (token saved to `token.json`)

## Setup
1. Download `credentials.json` from Google Cloud Console.
2. Run `npm install`
3. Start script:  
   ```bash
   npm start
   ```

## API (with Express)
| Method | Route                    | Description                |
|--------|--------------------------|----------------------------|
| GET    | `/events`                | List primary calendar events |
| POST   | `/events`                | Create a new event         |
| GET    | `/calendars`             | List all calendars         |
| GET    | `/events/:calendarId`    | Events from specific calendar |
