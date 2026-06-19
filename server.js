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
You are an expert interview coach helping developers sound sharp and confident in technical interviews.


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
    { "q": "string", "a": "string" },
    { "q": "string", "a": "string" },
    { "q": "string", "a": "string" }
  ]
}
YOUR TONE: Sound like a senior engineer explaining their work — specific, confident, grounded. NOT like a student describing a homework project.

RULES:
- Make answers detailed and strong (like a top candidate)
- Elevator pitch : 3 to 4 lines. Must use the most impressive concrete numbers from the description. If the user mentioned specific numbers, use them.
- Detailed explanation: structured, clear, professional
- Tech justification: explain WHY each tech
- Challenges: real depth, not generic
- Interview answers: strong and confident
- Write in FIRST PERSON (I built, I used)
- Make it interview-ready
- Keep sections SEPARATE (DO NOT merge)
- Return ONLY valid JSON. Zero markdown. Zero backticks. Zero text outside the JSON.
- ONLY use information the user explicitly provided. Never invent tools, techniques, or outcomes not mentioned.
- Never use filler: "seamless experience", "robust solution", "wide range", "cutting-edge", "leveraged".
- Tech justification: one specific reason per technology — WHY this tech for THIS project, not generic praise.
- Challenges: problem → why it was hard → specific approach → outcome. All in one flowing paragraph.
- Interview answers: show engineering thinking, not just what you built.
- interviewQA must ONLY cover topics the user explicitly mentioned. Never invent topics just to fill the quota.
- Every single claim in every answer must be traceable to something in the project input. If you cannot trace it, do not include it.
FINAL CHECK before outputting:
- Did I use the word "seamless"? If yes, rewrite that sentence rephrasing the sentence.
- Generate between 3 or 4 questions, only on topics explicitly mentioned in the input.
- Is every tech justification specific to THIS project's actual problem, not generic praise? If not, rewrite.
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
        temperature: 0.4,  // add this
        max_tokens: 1550,
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
// app.post("/create-qr", async (req, res) => {
//   const qr = await razorpay.qrCode.create({
//     type: "upi_qr",
//     name: "Explain My Project",
//     usage: "single_use",
//     fixed_amount: true,
//     payment_amount: 9900, // ₹99 in paise
//     description: "Pro Plan",
//     close_by: Math.floor(Date.now() / 1000) + 900 // expires in 15 min
//   });
//   res.json({ image_url: qr.image_url, qr_id: qr.id });
// });

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


///////////////////RESUME PARSING ENDPOINT////////////////////
app.post("/parse-resume", async (req, res) => {
  const { resumeText, jobRole } = req.body;
 
  if (!resumeText || resumeText.length < 100) {
    return res.status(400).json({ error: "Resume text is too short or missing." });
  }
 
  const roleContext = jobRole
    ? `The candidate is targeting the role: "${jobRole}". Factor this into keyword gap analysis.`
    : "No specific target role provided. Do a general analysis.";
 
  const prompt = `
You are an expert ATS resume analyzer and career coach.
 
${roleContext}
 
Analyze the resume below and return ONLY a valid JSON object — no markdown, no explanation, no backticks.
 
The JSON must follow this exact shape:
{
  "atsScore": <number 0-100>,
  "keywordScore": <number 0-100>,
  "impactScore": <number 0-100>,
  "formatScore": <number 0-100>,
  "overallFeedback": "<2-3 sentence honest assessment of the resume>",
  "keywordGaps": ["<missing keyword>", "<missing keyword>"],
  "weakBullets": [
    {
      "original": "<the weak bullet point as written>",
      "rewrite": "<stronger version with action verb, metric, impact>"
    }
  ]
}
 
Scoring guide:
- atsScore: How well will this pass ATS filters? Check for standard section headers, no tables/columns, parseable format.
- keywordScore: Does it contain relevant technical and domain keywords for the role?
- impactScore: Do bullet points quantify achievements? Avoid "responsible for", "worked on", "helped with".
- formatScore: Is length appropriate (1 page for <5 yrs exp), consistent formatting, no fluff?
 
Return up to 5 weak bullets. Be specific and honest. Return 5-10 keyword gaps.
 
Resume:
${resumeText.slice(0, 6000)}
`;
 
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  })
});

const completion = await response.json();
const raw = completion.choices[0]?.message?.content || "";
const clean = raw.replace(/```json|```/g, "").trim();
const data = JSON.parse(clean);

return res.json(data);
 
 
  } catch (err) {
    console.error("Resume analysis error:", err);
 
    // If JSON parse failed, return a helpful error
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "AI returned invalid response. Try again." });
    }
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});


////////////////Job Match Endpoint (SAME AS RESUME PARSE, JUST DIFFERENT PROMPT)////////////////////
app.post("/job-match", async (req, res) => {
  // FIX 1: Expect jobDescription instead of jobRole
  const { resumeText, jobDescription } = req.body;

  if (!resumeText || resumeText.length < 100) {
    return res.status(400).json({ error: "Resume text is too short or missing." });
  }

  // Update context to use the full Job Description
  const roleContext = jobDescription
    ? `Compare this resume against the following Job Description: \n"${jobDescription}"`
    : "No specific job description provided. Do a general analysis.";

  // FIX 2: Update the prompt to output exactly what your React UI wants
  const prompt = `
You are an expert ATS resume analyzer and career coach.

${roleContext}

Analyze the resume below against the job description and return ONLY a valid JSON object — no markdown, no explanation, no backticks.

The JSON must follow this exact shape:
{
  "overallMatch": <number 0-100>,
  "skillsMatch": <number 0-100>,
  "experienceMatch": <number 0-100>,
  "keywordCoverage": <number 0-100>,
  "roleAlignment": <number 0-100>,
  "summary": "<2-3 sentence honest assessment of the match>",
  "matchedSkills": ["<skill 1>", "<skill 2>"],
  "missingSkills": ["<missing skill 1>", "<missing skill 2>"],
  "prepPlan": [
    {
      "topic": "<topic to study>",
      "reason": "<why it matters for this role>",
      "hours": <estimated hours to learn, e.g. 5>
    }
  ]
}

Return up to 5 matched skills, up to 5 missing skills, and up to 3 prep plan tasks. Be honest and specific.

Resume:
${resumeText.slice(0, 6000)}
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Groq API Error:", errorData);
      return res.status(response.status).json({ error: "Upstream API error during analysis." });
    }

    const completion = await response.json();
    const raw   = completion.choices[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim(); 
    const data  = JSON.parse(clean);

    return res.json(data);

  } catch (err) {
    console.error("Resume analysis error:", err);
    if (err instanceof SyntaxError) {
      return res.status(500).json({ error: "AI returned invalid response format. Try again." });
    }
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});