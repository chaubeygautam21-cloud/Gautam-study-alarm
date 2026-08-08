import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for base64 image uploads
app.use(express.json({ limit: "25mb" }));

// Initialize Gemini client server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Default extracted sample schedule as fallback if image parsing is tested or fails
const SAMPLE_SCHEDULE = [
  {
    id: "sample_1",
    startTime: "05:30",
    endTime: "07:30",
    displayTime: "5:30 AM – 7:30 AM",
    subject: "Mathematics",
    subtopic: "Arithmetic / Advanced",
    instructions: "Video + Notes + 20–30 Questions",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_2",
    startTime: "08:30",
    endTime: "10:00",
    displayTime: "8:30 AM – 10:00 AM",
    subject: "Science",
    subtopic: "Theory & Concepts",
    instructions: "Video + Notes",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_3",
    startTime: "11:00",
    endTime: "12:00",
    displayTime: "11:00 AM – 12:00 PM",
    subject: "Reasoning",
    subtopic: "Logical & Analytical",
    instructions: "Video + Notes + 20 Questions",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_4",
    startTime: "14:00",
    endTime: "15:30",
    displayTime: "2:00 PM – 3:30 PM",
    subject: "Previous Day Revision",
    subtopic: "Formulae & Key Concepts",
    instructions: "Notes + Formulas + Concepts",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_5",
    startTime: "16:00",
    endTime: "18:00",
    displayTime: "4:00 PM – 6:00 PM",
    subject: "Mathematics Practice",
    subtopic: "Problem Solving",
    instructions: "40–50 Questions",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_6",
    startTime: "19:00",
    endTime: "20:30",
    displayTime: "7:00 PM – 8:30 PM",
    subject: "Science / Reasoning",
    subtopic: "Alternate Day Subjects",
    instructions: "Practice Questions + Notes",
    repeatType: "alternate",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    alternateSubjects: ["Science", "Reasoning"],
    enabled: true,
  },
  {
    id: "sample_7",
    startTime: "21:00",
    endTime: "22:00",
    displayTime: "9:00 PM – 10:00 PM",
    subject: "Revise Today's Notes",
    subtopic: "Self Evaluation & Errors",
    instructions: "30–50 MCQs, Write Mistakes in Error Notebook",
    repeatType: "daily",
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    enabled: true,
  },
  {
    id: "sample_8",
    startTime: "09:00",
    endTime: "12:00",
    displayTime: "9:00 AM – 12:00 PM (Sunday)",
    subject: "Sunday Full Revision & Mock Test",
    subtopic: "Weekly Evaluation",
    instructions: "Full Revision + Mock Test + Weak Topics + Analyze & Improve",
    repeatType: "sunday_only",
    daysOfWeek: [0],
    enabled: true,
  },
];

// API Route to parse handwritten timetable image using Gemini 3.6 Flash
app.post("/api/parse-schedule", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", useSample = false } = req.body;

    if (useSample || !imageBase64) {
      return res.json({
        success: true,
        source: "sample",
        sessions: SAMPLE_SCHEDULE,
        extractedCount: SAMPLE_SCHEDULE.length,
        notes: "Extracted study sessions from standard timetable.",
      });
    }

    // Clean base64 string if data URI prefix is present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const promptText = `
You are an expert AI OCR and timetable parser for study schedules.
Analyze the attached handwritten or printed study timetable image.

IMPORTANT RULES:
1. Extract ALL STUDY SESSIONS with readable time ranges, subjects, subtopics, and instructions.
2. CRITICAL: IGNORE AND FILTER OUT ALL BREAKS OR NON-STUDY ACTIVITIES!
   - DO NOT create sessions for: Breaks (e.g. 7:30-8:00 AM Break, 10:00-10:30 AM Break, 3:30-4:00 PM Break), Lunch, Rest, Dinner, Walk, Exercise, Sleep.
   - ONLY create items for actual study activities (e.g., Mathematics, Science, Reasoning, Revision, Practice, Mock Test, MCQs).
3. Detect AM/PM correctly based on standard daily timeline flow (5:30 AM morning vs 5:30 PM evening).
4. Detect subtopics and specific study instructions written below or next to the subject (e.g., "Video + Notes + 20-30 Questions", "30-50 MCQs", "Write Mistakes in Error Notebook").
5. Detect repeat rules:
   - 'daily': standard daily study sessions
   - 'alternate': sessions alternating between subjects on different days (e.g. Science / Reasoning on alternate days)
   - 'sunday_only': special Sunday revision/mock test schedule
   - 'weekly' or 'specific_days': specific days of week
6. Output 24-hour startTime ("HH:MM") and endTime ("HH:MM").

Return JSON strictly matching the specified structure.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sessions: {
              type: Type.ARRAY,
              description: "Extracted study sessions only (breaks excluded)",
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.STRING, description: "24-hour start time HH:MM (e.g., 05:30)" },
                  endTime: { type: Type.STRING, description: "24-hour end time HH:MM (e.g., 07:30)" },
                  displayTime: { type: Type.STRING, description: "Human readable time range e.g., 5:30 AM - 7:30 AM" },
                  subject: { type: Type.STRING, description: "Main subject or session title" },
                  subtopic: { type: Type.STRING, description: "Sub-topic, focus area, or chapter" },
                  instructions: { type: Type.STRING, description: "Detailed action tasks (e.g., Video + Notes + 20 Questions)" },
                  repeatType: {
                    type: Type.STRING,
                    description: "daily, alternate, sunday_only, specific_days, or weekly",
                  },
                  daysOfWeek: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                    description: "Days of week 0=Sun, 1=Mon, ..., 6=Sat",
                  },
                  alternateSubjects: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Subjects if alternating days",
                  },
                },
                required: ["startTime", "endTime", "subject", "instructions", "repeatType"],
              },
            },
            notes: { type: Type.STRING, description: "Brief overview of what was parsed" },
          },
          required: ["sessions"],
        },
      },
    });

    const parsedText = response.text || "{}";
    const parsedData = JSON.parse(parsedText);

    const formattedSessions = (parsedData.sessions || []).map((s: any, idx: number) => ({
      id: `extracted_${Date.now()}_${idx}`,
      startTime: s.startTime || "09:00",
      endTime: s.endTime || "10:00",
      displayTime: s.displayTime || `${s.startTime} – ${s.endTime}`,
      subject: s.subject || "Study Session",
      subtopic: s.subtopic || "",
      instructions: s.instructions || "Focus study session",
      repeatType: s.repeatType || "daily",
      daysOfWeek: s.daysOfWeek && s.daysOfWeek.length ? s.daysOfWeek : [1, 2, 3, 4, 5, 6],
      alternateSubjects: s.alternateSubjects || [],
      enabled: true,
    }));

    // If AI extracted nothing or image was too blurry, fallback to sample and inform user
    if (formattedSessions.length === 0) {
      return res.json({
        success: true,
        source: "fallback_sample",
        sessions: SAMPLE_SCHEDULE,
        extractedCount: SAMPLE_SCHEDULE.length,
        notes: "Could not detect clear handwriting. Loaded standard study schedule template.",
      });
    }

    return res.json({
      success: true,
      source: "gemini_ocr",
      sessions: formattedSessions,
      extractedCount: formattedSessions.length,
      notes: parsedData.notes || "Successfully extracted study schedule from image.",
    });
  } catch (error: any) {
    console.error("Error parsing schedule image with Gemini:", error);
    // Return sample fallback so the app continues seamlessly
    return res.json({
      success: true,
      source: "error_fallback_sample",
      sessions: SAMPLE_SCHEDULE,
      extractedCount: SAMPLE_SCHEDULE.length,
      notes: "Error calling Gemini OCR API. Provided default study timetable schedule.",
    });
  }
});

// Sample schedule endpoint
app.get("/api/sample-schedule", (req, res) => {
  res.json({ success: true, sessions: SAMPLE_SCHEDULE });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Study Alarm Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
