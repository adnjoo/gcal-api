const { google } = require("googleapis");

module.exports = function setupRoutes(app, auth) {
  const calendar = google.calendar({ version: "v3", auth });

  // 🔹 List all calendars
  app.get("/calendars", async (req, res) => {
    try {
      const result = await calendar.calendarList.list();
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // 🔹 List events from primary calendar (optional date filtering)
  app.get("/events", async (req, res) => {
    const { timeMin, timeMax } = req.query;

    try {
      const result = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
        timeMin: timeMin || undefined,
        timeMax: timeMax || undefined,
      });
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // 🔹 List events from a specific calendar (with optional date filtering)
  app.get("/events/:calendarId", async (req, res) => {
    const { calendarId } = req.params;
    const { timeMin, timeMax } = req.query;

    try {
      const result = await calendar.events.list({
        calendarId,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
        timeMin: timeMin || undefined,
        timeMax: timeMax || undefined,
      });
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // 🔹 Create a new event in the primary calendar
  app.post("/events", async (req, res) => {
    const event = req.body;

    try {
      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });
      res.json(result.data);
    } catch (err) {
      res.status(500).send(err);
    }
  });
};
