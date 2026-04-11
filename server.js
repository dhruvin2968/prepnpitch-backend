import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import crypto from "crypto";
import Razorpay from "razorpay";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.post("/generate", async (req, res) => {
  try {
    const { formData } = req.body;

    // 🔥 Strong prompt (forces structured JSON)
    const prompt = `
You are an expert interview coach.

STRICT INSTRUCTIONS:
- Return ONLY valid JSON
- NO markdown
- NO headings
- NO explanations outside JSON
- NO triple backticks

FORMAT EXACTLY LIKE THIS:

{
  "elevatorPitch": "string",
  "detailedExplanation": "string",
  "techStackJustification": "string",
  "challengesAndSolutions": "string",
  "interviewQA": [
    { "q": "string", "a": "string" },
    { "q": "string", "a": "string" }
  ]
}

RULES:
- Make answers detailed and strong (like a top candidate)
- Elevator pitch: 3 to 4 lines
- Detailed explanation: structured, clear, professional
- Tech justification: explain WHY each tech
- Challenges: real depth, not generic
- Interview answers: strong and confident
- Write in FIRST PERSON (I built, I used)
- Make it interview-ready
- Keep sections SEPARATE (DO NOT merge)

Project:
Name: ${formData.projectName}
Tech Stack: ${formData.techStack}
Description: ${formData.description}
Contribution: ${formData.contribution}
Challenge: ${formData.challenge}
`;

    // 🔥 API CALL
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const rawText = await response.text();
    console.log("RAW RESPONSE:", rawText);

    // 🔥 Parse Groq response safely
    let apiData;
    try {
      apiData = JSON.parse(rawText);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON from Groq",
        raw: rawText
      });
    }

    if (!apiData.choices || !apiData.choices[0]) {
      return res.status(500).json({
        error: "No choices returned from Groq",
        apiData
      });
    }

    let output = apiData.choices[0].message.content;

    // 🔥 CLEAN OUTPUT (remove ```json if present)
    output = output
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // 🔥 FINAL PARSE (AI output → structured JSON)
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      console.error("FINAL PARSE FAILED:", output);

      return res.status(500).json({
        error: "AI did not return valid JSON",
        raw: output
      });
    }

    // ✅ SUCCESS
    return res.json(parsed);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message
    });
  }
});

////////PAYMENT ENDPOINT (TEST)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});
app.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: 9900, // ₹99 in paise
      currency: "INR",
      receipt: "order_rcptid_11"
    };

    const order = await razorpay.orders.create(options);

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    // ✅ PAYMENT VERIFIED

    // 🔥 Upgrade user to PRO in Firestore
    // updateDoc(userRef, { plan: "pro_monthly" })

    res.json({ success: true });
  } else {
    res.status(400).json({ success: false });
  }
});
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});