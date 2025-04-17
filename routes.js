const { google } = require("googleapis");
const { Client } = require("@notionhq/client");
const { OpenAI } = require("openai");

const generateIntentionEvent = require("./lib/generateIntentionEvent");

// OpenAI client setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 Notion client setup
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getBlockChildren(blockId) {
  return await notion.blocks.children.list({ block_id: blockId });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanEvent(event) {
  return {
    id: event.id,
    summary: event.summary || "",
    description: event.description || "",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location || null,
    attendees:
      event.attendees?.map((a) => ({
        email: a.email,
        responseStatus: a.responseStatus,
      })) || [],
    colorId: event.colorId || null,
    htmlLink: event.htmlLink || null,
    hangoutLink: event.hangoutLink || null,
    eventType: event.eventType || "default",
  };
}

async function getAllChildrenRecursive(blockId, depth = 0, maxDepth = 1) {
  if (depth > maxDepth) return [];

  console.log(
    `${"  ".repeat(
      depth
    )}📦 Fetching children of block ${blockId} at depth ${depth}`
  );

  const allBlocks = [];
  let cursor = undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
    });

    for (const block of response.results) {
      console.log(
        `${"  ".repeat(depth)}↳ Got block ${block.id} [${block.type}]`
      );
    }

    allBlocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;

    await sleep(100); // gentle throttle
  } while (cursor);

  for (const block of allBlocks) {
    if (block.has_children) {
      await sleep(100);
      block.children = await getAllChildrenRecursive(
        block.id,
        depth + 1,
        maxDepth
      );
    }
  }

  return allBlocks;
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

  // 🔹 List events from primary calendar (for current year)
  app.get("/events", async (req, res) => {
    let { timeMin, timeMax } = req.query;

    // If not provided, default to current year
    const now = new Date();
    const thisYear = now.getFullYear();

    if (!timeMin) {
      timeMin = new Date(Date.UTC(thisYear, 0, 1)).toISOString(); // Jan 1
    }

    if (!timeMax) {
      timeMax = new Date(Date.UTC(thisYear + 1, 0, 1)).toISOString(); // Jan 1 next year
    }

    try {
      const result = await calendar.events.list({
        calendarId: "primary",
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
        timeMin,
        timeMax,
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
      res.json(result.data.items.map(cleanEvent));
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

  app.post("/intentions", async (req, res) => {
    const { feeling, start, end } = req.body;

    try {
      const intention = await generateIntentionEvent(feeling);

      const event = await calendar.events.insert({
        calendarId: "primary",
        resource: {
          summary: intention.summary,
          description: intention.description,
          start: { dateTime: start },
          end: { dateTime: end },
          colorId: intention.colorId,
        },
      });

      res.json(event.data);
    } catch (err) {
      console.error("Error creating intention:", err);
      res.status(500).send(err.message);
    }
  });

  app.post("/focus-edit", async (req, res) => {
    const { intention, start, end } = req.body;

    if (!intention) return res.status(400).send("Missing intention");

    try {
      // 1. Fetch events in range (default to next 7 days if not provided)
      const timeMin = start || new Date().toISOString();
      const timeMax =
        end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const eventsRes = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        q: "Focus Session", // only search for these
      });

      const focusedSessions = eventsRes.data.items || [];

      if (focusedSessions.length === 0) {
        return res.status(200).json({ message: "No Focused Sessions found." });
      }

      console.log(`📅 Found ${focusedSessions.length} Focused Sessions`);

      // 2. Generate updated description with GPT
      const prompt = `Given this intention: "${intention}", suggest 3 gentle, emotionally intelligent tasks that help the user move toward their goal. Format as a bullet list.`;

      const gptRes = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You're a calm productivity coach who writes soft, emotionally aware todos.",
          },
          { role: "user", content: prompt },
        ],
      });

      const newDescription = gptRes.choices[0].message.content.trim();

      // 3. Rate-limit-safe patch loop
      const updates = [];

      for (const event of focusedSessions) {
        try {
          const updated = await calendar.events.patch({
            calendarId: "primary",
            eventId: event.id,
            resource: {
              description: newDescription,
            },
          });

          updates.push({
            id: event.id,
            summary: event.summary,
            updated: true,
          });

          console.log(`✅ Updated: ${event.summary} (${event.id})`);
          await sleep(300); // 🔄 gentle delay
        } catch (patchErr) {
          console.error(`❌ Failed to update ${event.id}:`, patchErr.message);
        }
      }

      res.json({ updates });
    } catch (err) {
      console.error("Error in /focus-edit:", err);
      res.status(500).send(err.message);
    }
  });
};
