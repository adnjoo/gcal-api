const { google } = require("googleapis");

module.exports = function setupRoutes(app, auth) {
  const calendar = google.calendar({ version: "v3", auth });

  // List all calendars
  app.get("/calendars", async (req, res) => {
    try {
      const result = await calendar.calendarList.list();
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // List all events from primary calendar
  app.get("/events", async (req, res) => {
    try {
      const result = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
      });
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // List events from a specific calendar
  app.get("/events/:calendarId", async (req, res) => {
    const { calendarId } = req.params;
    try {
      const result = await calendar.events.list({
        calendarId,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
      });
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err);
    }
  });

  // Create a new event
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
