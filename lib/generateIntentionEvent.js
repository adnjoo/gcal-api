// lib/generateIntentionEvent.js
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateIntentionEvent(feeling) {
  const prompt = `
You're a gentle emotional support coach for neurodivergent people. Based on the feeling "${feeling}", suggest a short Gcal event with:

- a comforting title
- a soft, encouraging description
- a Gcal colorId from 1–11 (1 = soft blue, 5 = mellow yellow, 11 = grounding gray)
Return JSON with keys: summary, description, colorId
`;

  const chatResponse = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });

  const jsonStart = chatResponse.choices[0].message.content.indexOf("{");
  const jsonString = chatResponse.choices[0].message.content.slice(jsonStart);
  return JSON.parse(jsonString);
}

module.exports = generateIntentionEvent;
