import { GoogleGenAI } from "@google/genai";
import { IncomingForm } from "formidable";

export const config = {
  api: { bodyParser: false },
};

const MAX_BYTES = 3 * 1024 * 1024;

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      multiples: false,
      maxFiles: 1,
      maxFileSize: MAX_BYTES,
      allowEmptyFiles: false,
      minFileSize: 1,
      keepExtensions: true,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function asOne(value) {
  return Array.isArray(value) ? value[0] : value;
}

function mimeFor(file) {
  if (file.mimetype && file.mimetype.startsWith("audio/")) return file.mimetype;
  const ext = (file.originalFilename || "").toLowerCase().split(".").pop();
  const map = {
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
    mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg",
    oga: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
    amr: "audio/amr"
  };
  return map[ext] || null;
}

function parseJsonMaybe(text) {
  const cleaned = String(text || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch { return null; }
}

function validSegments(items, transcript) {
  if (Array.isArray(items)) {
    const clean = items.map((s) => ({
      start: Math.max(0, Number(s.start) || 0),
      end: Math.max(0, Number(s.end) || 0),
      text: String(s.text || "").trim(),
    })).filter((s) => s.text && s.end > s.start);
    if (clean.length) return clean;
  }
  if (transcript) return [{ start: 0, end: 5, text: transcript }];
  return [];
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(milli).padStart(3,"0")}`;
}

function makeSrt(segments) {
  return segments.map((s, i) =>
    `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}`
  ).join("\n\n") + "\n";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST request අවශ්‍යයි." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Vercel Environment Variables තුළ GEMINI_API_KEY සකසා නැහැ." });
  }

  let file;
  try {
    const { files } = await parseForm(req);
    file = asOne(files.audio);
    if (!file || !file.filepath) {
      return res.status(400).json({ error: "Audio file එකක් තෝරන්න." });
    }
    if (file.size > MAX_BYTES) {
      return res.status(413).json({ error: "Vercel version එකේ file එක 3 MB ට වඩා කුඩා විය යුතුයි." });
    }

    const mimeType = mimeFor(file);
    if (!mimeType) {
      return res.status(400).json({ error: "Audio format එක හඳුනාගන්න බැහැ. MP3, WAV, M4A, AAC, OGG, FLAC හෝ WEBM භාවිතා කරන්න." });
    }

    const fs = await import("node:fs/promises");
    const audioBuffer = await fs.readFile(file.filepath);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.TRANSCRIBE_MODEL || "gemini-3.5-transcribe";
    const translateModel = process.env.TRANSLATE_MODEL || "gemini-3.5-flash-lite";

    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audioBuffer.toString("base64") } },
          { text: `Transcribe the audio in its original spoken language. Do not translate the original transcript.
Return only valid JSON using this schema:
{
  "language": "detected language",
  "transcript": "complete transcript",
  "segments": [
    {"start": 0.0, "end": 2.4, "text": "spoken words"}
  ]
}
The segment timestamps must be in seconds, chronological, and aligned to the audio. Split into readable subtitle-sized segments. Do not include markdown fences.` }
        ]
      }],
      config: { responseMimeType: "application/json" }
    });

    const raw = response.text || "";
    const parsed = parseJsonMaybe(raw);
    const transcript = String(parsed?.transcript || "").trim();
    if (!transcript) {
      return res.status(502).json({ error: "Model එකෙන් transcript එක ලබාගන්න බැරි වුණා. වෙනත් කෙටි audio file එකකින් උත්සාහ කරන්න." });
    }

    const originalSegments = validSegments(parsed?.segments, transcript);
    const translationResponse = await ai.models.generateContent({
      model: translateModel,
      contents: [{
        role: "user",
        parts: [{ text: `Translate the following transcript into natural Sinhala. Preserve names, meaning, and line order. Do not summarize. Return only valid JSON in this format: {"translation":"full Sinhala translation","segments":[{"text":"Sinhala translation of segment 1"}]}. The segments array must have exactly one translated item for each input segment, in the same order. If the source is already Sinhala, retain it naturally.\n\nSOURCE LANGUAGE: ${String(parsed?.language || "auto-detected")}\nTRANSCRIPT SEGMENTS:\n${JSON.stringify(originalSegments.map(s => s.text))}` }]
      }],
      config: { responseMimeType: "application/json" }
    });

    const translatedParsed = parseJsonMaybe(translationResponse.text || "");
    const translatedText = String(translatedParsed?.translation || "").trim();
    const translatedItems = Array.isArray(translatedParsed?.segments) ? translatedParsed.segments : [];
    const sinhalaSegments = originalSegments.map((seg, i) => ({
      ...seg,
      text: String(translatedItems[i]?.text || "").trim() || seg.text
    }));

    return res.status(200).json({
      language: String(parsed?.language || "Unknown"),
      transcript,
      translation: translatedText || sinhalaSegments.map(s => s.text).join(" "),
      originalSrt: makeSrt(originalSegments),
      sinhalaSrt: makeSrt(sinhalaSegments),
      originalSegments,
      sinhalaSegments
    });
  } catch (err) {
    const message = String(err?.message || "Unknown error");
    if (err?.httpCode === 413 || /maxFileSize|larger than/i.test(message)) {
      return res.status(413).json({ error: "Audio file එක 3 MB ට වඩා කුඩා කරන්න. Vercel Functions වල request limit එක 4.5 MB." });
    }
    console.error("Transcription request failed:", message);
    if (/API key|api_key|unauthorized|permission denied/i.test(message)) {
      return res.status(502).json({ error: "Gemini API key එක හෝ model access එක පරීක්ෂා කරන්න." });
    }
    return res.status(502).json({ error: "Transcription අසාර්ථකයි. Model availability, API quota සහ audio format එක පරීක්ෂා කර නැවත උත්සාහ කරන්න." });
  }
}
