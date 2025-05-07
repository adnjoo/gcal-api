const { google } = require("googleapis");
const { Client } = require("@notionhq/client");
const { OpenAI } = require("openai");

const generateIntentionEvent = require("./lib/generateIntentionEvent");

// OpenAI client setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 Notion client setup
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const typeMap = {
  paragraph: "p",
  bulleted_list_item: "bullet",
  numbered_list_item: "number",
  child_page: "page",
  to_do: "todo",
  heading_1: "h1",
  heading_2: "h2",
  heading_3: "h3",
  code: "code",
};

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

function compressBlocks(blocks) {
  return blocks
    .map((block) => {
      const mappedType = typeMap[block.type] || block.type;

      let text = "";
      if (block.type === "child_page") {
        text = block.child_page?.title || "";
      } else if (block[block.type]?.rich_text) {
        text =
          block[block.type].rich_text.map((t) => t.plain_text).join("") || "";
      }

      if (block.has_children && block.children && block.children.length > 0) {
        if (block.type === "child_page") {
          return [
            mappedType,
            text,
            compressBlocks(block.children), // 🧠 capture children and title
          ];
        } else {
          return [mappedType, compressBlocks(block.children)];
        }
      } else {
        return [mappedType, text];
      }
    })
    .filter(([type, content]) => {
      if (type === "page") {
        return true; // Always keep page blocks
      }
      if (Array.isArray(content)) {
        return content.length > 0;
      } else {
        return content.trim() !== "";
      }
    });
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
      res.json(compressBlocks(data));
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // 🔹 Generic route to list entries of a Notion database
  app.get("/notion/db/:databaseId", async (req, res) => {
    const { databaseId } = req.params;

    try {
      const response = await notion.databases.query({
        database_id: databaseId,
        sorts: [{ timestamp: "created_time", direction: "descending" }],
      });

      const data = response.results.map((page) => {
        const props = page.properties;

        // Try to extract common fields safely
        return {
          id: page.id,
          name: props.Name?.title?.[0]?.plain_text || "(no title)",
          date: props.Date?.date?.start || null,
          author: props.Author?.rich_text?.[0]?.plain_text || null,
          created_time: page.created_time,
        };
      });

      res.json(data);
    } catch (err) {
      console.error("❌ Error fetching database:", err.message);
      res.status(500).send(err.message);
    }
  });

  app.post("/notion/db/:databaseId/transform", async (req, res) => {
    const { databaseId } = req.params;
    const { instruction, dryRun } = req.body;
    const limit = parseInt(req.query.limit || "10");

    if (!instruction) return res.status(400).send("Missing instruction");

    try {
      const response = await notion.databases.query({
        database_id: databaseId,
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: limit,
      });

      const rawEntries = response.results.map((page) => {
        const entry = { id: page.id, created_time: page.created_time };

        for (const [key, value] of Object.entries(page.properties)) {
          const type = value.type;
          switch (type) {
            case "title":
              entry[key] = value.title?.[0]?.plain_text || "";
              break;
            case "rich_text":
              entry[key] = value.rich_text?.[0]?.plain_text || "";
              break;
            case "date":
              entry[key] = value.date?.start || "";
              break;
            default:
              entry[key] = ""; // unsupported field types skipped
          }
        }

        return entry;
      });

      const prompt = `
  You are a JSON data cleaner. The user said: "${instruction}".
  Return ONLY a JSON array with the same structure and IDs. Do not include "Output:" or any explanation.
  
  Here is the data:
  ${JSON.stringify(rawEntries, null, 2)}
  `;

      const aiRes = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You return only clean JSON arrays. No commentary. No headings. No notes.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      });

      let raw = aiRes.choices?.[0]?.message?.content || "[]";
      raw = raw.trim().replace(/^.*?\[\s*{/, "[{"); // strip non-JSON prefix
      const match = raw.match(/\[\s*{[\s\S]*}\s*\]/);
      const transformed = match ? JSON.parse(match[0]) : [];

      const results = [];

      for (const updated of transformed) {
        const originalRaw = rawEntries.find((e) => e.id === updated.id);
        const originalPage = response.results.find((p) => p.id === updated.id);
        if (!originalRaw || !originalPage) continue;

        const patch = {};
        const changedFields = {};

        for (const [field, newVal] of Object.entries(updated)) {
          if (field === "id" || field === "created_time") continue;

          const oldVal = originalRaw[field];
          if (newVal !== oldVal) {
            changedFields[field] = { from: oldVal, to: newVal };
          }

          const type = originalPage.properties[field]?.type;
          if (!type) continue;

          switch (type) {
            case "title":
              patch[field] = { title: [{ text: { content: newVal } }] };
              break;
            case "rich_text":
              patch[field] = { rich_text: [{ text: { content: newVal } }] };
              break;
            case "date":
              patch[field] = { date: { start: newVal } };
              break;
            default:
              break;
          }
        }

        if (dryRun) {
          results.push({ id: updated.id, changedFields });
          continue;
        }

        try {
          await notion.pages.update({
            page_id: updated.id,
            properties: patch,
          });

          results.push({ id: updated.id, updated: true, changedFields });
          await sleep(200); // rate-limit buffer
        } catch (err) {
          results.push({ id: updated.id, error: err.message });
        }
      }

      res.json({
        message: dryRun
          ? "Preview only – no updates made"
          : "Transformed and patched",
        results,
      });
    } catch (err) {
      console.error("❌ Error:", err.message);
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
      const timeMin = start || new Date().toISOString();
      const timeMax =
        end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const eventsRes = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        q: "Focus Session",
      });

      const focusedSessions = (eventsRes.data.items || []).filter(
        (e) => e.summary === "Focus Session"
      );

      if (focusedSessions.length === 0) {
        return res.status(200).json({ message: "No Focus Sessions found." });
      }

      console.log(`📅 Found ${focusedSessions.length} Focus Sessions`);

      // 💡 Generate different GPT descriptions per day
      const prompt = `Given the weekly goal "${intention}", generate a 5-day sequence of emotionally intelligent and practical tasks (one set per day) that help the user move toward their goal. Return them as a JSON array of strings. Each string should be 3 bullet points for that day.`;

      const gptRes = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You're a practical yet kind productivity coach. You return JSON arrays of task descriptions.",
          },
          { role: "user", content: prompt },
        ],
      });

      const taskSetsRaw = gptRes.choices?.[0]?.message?.content || "[]";
      const taskSets = JSON.parse(taskSetsRaw);

      const updates = [];

      for (let i = 0; i < focusedSessions.length; i++) {
        const session = focusedSessions[i];
        const dayTasks = taskSets[i] || taskSets[taskSets.length - 1]; // fallback to last day’s tasks

        try {
          const updated = await calendar.events.patch({
            calendarId: "primary",
            eventId: session.id,
            resource: {
              description: dayTasks,
            },
          });

          updates.push({
            id: session.id,
            summary: session.summary,
            date: session.start?.dateTime || session.start?.date,
            updated: true,
          });

          console.log(
            `✅ Patched: ${session.summary} on ${session.start?.dateTime}`
          );
          await sleep(500); // 💧 rate-limit buffer
        } catch (patchErr) {
          console.error(`❌ Failed on ${session.id}:`, patchErr.message);
        }
      }

      res.json({ updates });
    } catch (err) {
      console.error("Error in /focus-edit:", err);
      res.status(500).send(err.message);
    }
  });
};
