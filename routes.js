const { google } = require("googleapis");
const { Client } = require("@notionhq/client");

// 🧠 Notion client setup
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getBlockChildren(blockId) {
  return await notion.blocks.children.list({ block_id: blockId });
}

async function getAllChildrenRecursive(blockId) {
  const result = await notion.blocks.children.list({ block_id: blockId });
  const blocks = result.results;

  for (const block of blocks) {
    if (block.has_children) {
      block.children = await getAllChildrenRecursive(block.id);
    }
  }

  return blocks;
}

module.exports = function setupRoutes(app, auth) {
  const calendar = google.calendar({ version: "v3", auth });

  // 🔹 List all calendars
  app.get("/calendars", async (req, res) => {
    try {
      const result = await calendar.calendarList.list();
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // 🔹 List events from primary calendar
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
      res.status(500).send(err.message);
    }
  });

  // 🔹 List events from primary calendar for a specific month
  app.get("/events/monthly", async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).send("Missing year or month");

    const y = parseInt(year);
    const m = parseInt(month) - 1;

    const timeMin = new Date(Date.UTC(y, m, 1)).toISOString();
    const timeMax = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)).toISOString();

    try {
      const result = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        timeMin,
        timeMax,
      });
      res.json(result.data.items);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // 🔹 List events from specific calendar
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
      res.status(500).send(err.message);
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
      res.status(500).send(err.message);
    }
  });

  // 🧠 Notion: Get direct children of a block
  app.get("/notion/:blockId/children", async (req, res) => {
    try {
      const data = await getBlockChildren(req.params.blockId);
      res.json(data);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // 🧠 Notion: Recursively get all children of a block
  app.get("/notion/:blockId/all", async (req, res) => {
    try {
      const data = await getAllChildrenRecursive(req.params.blockId);
      res.json(data);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });
};
