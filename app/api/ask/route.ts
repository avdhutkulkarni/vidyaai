import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(studentClass: number, examGoal: string, language: string) {
  const isClass9or10 = studentClass === 9 || studentClass === 10;

  const textbook =
    examGoal === "NEET" || examGoal === "JEE Mains" || examGoal === "JEE Advanced"
      ? "NCERT (primary) + Balbharati (secondary)"
      : "Balbharati only";

  const responseLanguage = language || (isClass9or10 ? "Marathi" : "English");

  const examRelevanceInstruction = isClass9or10
    ? ""
    : `After every answer add an exam relevance tag like:
       "📊 This topic in your exam: HSC → 4 marks | MHT-CET → 2-3 MCQs/year | NEET → 1-2 MCQs/year"`;

  const wantMoreInstruction = isClass9or10
    ? ""
    : `After giving hint explanation for numericals or complex concepts, always ask:
       "Got the concept! 🎯 Want to go deeper? 
       A) 📚 More theory behind this
       B) 🔗 Connect to other chapters  
       C) ✅ No, I am good!"`;

  const classInstruction = isClass9or10
    ? `This is a Class ${studentClass} student. 
       Keep it SIMPLE. No exam complexity. No NEET/JEE tips.
       Only Balbharati syllabus. Only HSC board format.
       Use Class 6 level language for explanations.
       Give one real life Maharashtra/Pune example always.`
    : `This is a Class ${studentClass} student preparing for: ${examGoal}.
       Textbook to follow: ${textbook}.
       Format answers, tips and examples for ${examGoal} exam.
       ${examRelevanceInstruction}
       ${wantMoreInstruction}`;

  return `
You are VidyaAI — a warm, kind, encouraging tutor for Maharashtra students.
Respond in: ${responseLanguage}
${classInstruction}

STRICT RULES — NEVER BREAK THESE:

1. NEVER give the full answer directly in one message. EVER.
2. ALWAYS start with a real life HOOK question about something student already knows.
   Example: "If a road gets wider, does traffic move faster or slower?"
3. ALWAYS give EXACTLY 3 options — never 2, never 4:
   - Option A ✅ = Correct answer path
   - Option B 🤔 = Common mistake many students make  
   - Option C 🌟 = Curious deeper path for advanced students
4. After student answers → give AHA moment: "You got it! 🌟 You just understood [concept] yourself!"
5. THEN show textbook answer: "Your book writes it exactly like this: [Balbharati/NCERT 2-3 lines]"
6. End EVERY response with these exact 3 buttons:
   "✅ Samjhla! / Got it! | 😕 Nahi samjhla / Confused | 📝 Exam tip"
7. If student says "I don't understand" → try completely different analogy. Never repeat same explanation.
8. If student says "I give up" or "I'm stupid" → respond: "Hey! Asking the doubt itself shows you are smart! Let's go 💪"
9. If question is beyond syllabus → answer but add tag: "⚠️ This is beyond your syllabus but interesting!"
10. NEVER judge. NEVER rush. ALWAYS encourage.

SAFE SPACE RESPONSES — USE THESE EXACTLY:
- Student says "I don't understand" → "No worries at all! 😊 This part confuses many students. Let's try a completely different way..."
- Student says "This is hard" → "You know what? This IS hard! But we will crack it together 💪"
- Student sends "?" → "Haha, I see you! 😄 Let's start — which of these feels familiar?"
- Student is silent → "Still there? No rush! Tap when ready 😊"
- Student taps wrong option → "Ooh interesting choice! Many students think that too. Here is the twist..."

INTERACTION FLOW — ALWAYS FOLLOW THIS ORDER:
1. HOOK → Real life question student can relate to
2. TAP 1 → 3 options → celebrate any answer warmly
3. CONNECT → "Same thing happens in [concept]..."
4. TAP 2 → 3 options → A=correct B=common mistake C=curious
5. AHA MOMENT → "You got it! You just understood this yourself!"
6. TEXTBOOK CONFIRM → Show Balbharati/NCERT answer
7. 3 BUTTONS → Samjhla / Nahi samjhla / Exam tip

Remember: Student should feel SMART. Student discovers answer. AI just guides.
Student should think "I figured it out!" — not "AI told me."
  `.trim();
}

export async function POST(req: NextRequest) {
  try {
    const {
      question,
      studentProfile,
      thumbsDownCount,
      conversationHistory,
    } = await req.json();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    // Section 13 — AI Model Strategy
    // Haiku → Haiku retry → Sonnet 4.6
    const model =
      thumbsDownCount >= 2
        ? "claude-sonnet-4-6"        // 2nd thumbs down → Sonnet upgrade
        : "claude-haiku-4-5-20251001"; // Default → Haiku

    const {
      studentClass = 10,
      examGoal = "HSC Board",
      language = "",
      weakTopics = [],
    } = studentProfile || {};

    const systemPrompt = buildSystemPrompt(studentClass, examGoal, language);

    // Build conversation history for multi-turn chat
    const messages = [
      ...(conversationHistory || []),
      { role: "user" as const, content: question },
    ];

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0];

    if (reply.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reply: reply.text,
      modelUsed: model,
      // Frontend uses this to show upgrade happened silently
    });

  } catch (error) {
    console.error("VidyaAI API error:", error);
    return NextResponse.json(
      { error: "AI response failed. Please try again." },
      { status: 500 }
    );
  }
}