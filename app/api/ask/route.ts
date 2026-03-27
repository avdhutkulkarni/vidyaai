import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { checkAndIncrement } from '@/lib/doubtLimit'
import { getSyllabusVersion } from '@/lib/syllabusVersion'
import {
  hashText,
  hashImage,
  detectCacheableType,
  checkCache,
  checkPhotoCache,
  saveToCache,
  savePhotoToCache
} from '@/lib/cache'
import { saveDoubtHistory } from '@/lib/doubtHistory'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOKEN_BUDGET = 4000

// ─────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────

function getTextbook(examGoal: string): string {
  if (['NEET', 'JEE Mains', 'JEE Advanced'].includes(examGoal)) {
    return 'NCERT (primary) and Balbharati (secondary where relevant)'
  }
  return 'Balbharati'
}

function getLanguageInstruction(studentClass: number, wantsMarathi: boolean): string {
  if (!wantsMarathi) {
    return `Respond in simple clear English only.
- Talk like a friendly elder brother or sister.
- Very short sentences. Very easy words.
- If any difficult word comes, explain it in simple words in brackets.`
  }
  if (studentClass === 11 || studentClass === 12) {
    return `Student has requested Marathi explanation.
- Write explanation in Marathi (Devanagari script).
- All concept names and formulas stay in English.
- Example: "Newton चा नियम सांगतो की जेव्हा ball ला force लागतो..."
- Never translate scientific terms or formulas.`
  }
  return `Student has requested Marathi explanation.
- Write in simple Marathi (Devanagari script).
- Concept name in Marathi first then English in bracket.
- Example: "बल (Force)" or "वेग (Velocity)"
- Very simple Marathi words only.`
}

function buildSystemPrompt(
  studentClass: number,
  examGoal: string,
  studentName: string,
  wantsMarathi: boolean,
  thumbsDownCount: number
): string {
  const isJunior = studentClass === 9 || studentClass === 10
  const textbook = getTextbook(examGoal)
  const langInstruction = getLanguageInstruction(studentClass, wantsMarathi)
  const firstName = studentName.split(' ')[0] || 'Student'

  return `You are VidyaAI — ${firstName}'s caring elder brother who makes science fun and easy.
Student: Class ${studentClass}${!isJunior ? `, ${examGoal}` : ''}. Textbook: ${textbook}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONALITY — NEVER BREAK THIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Talk like a friendly elder brother explaining to a 10 year old Indian child.
- Sound excited and warm. Never boring. Never formal.
- Use ONLY real Indian life examples:
  cricket match, chai getting cold, mobile charging, auto rickshaw,
  mother cooking on gas, mango falling from tree, school bell ringing,
  rain on window, train on track, kite flying, ceiling fan, pressure cooker.
- Very simple words. Short sentences.
- Never sound like a textbook or teacher.
- Say things like "Think about this!", "Here is the cool part!", "Notice this!", "Simple right?", "Now watch what happens!".
- Never say "therefore", "hence", "thus", "henceforth", "subsequently".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${langInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPLY LENGTH — ABSOLUTE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Every reply MUST be 5-7 lines maximum.
- NEVER write long paragraphs.
- NEVER dump everything at once.
- One blank line between sections.
- Always end with exactly ONE question OR one set of A/B/C options.
- Wait for student to respond before moving to next step.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETECT QUESTION TYPE FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before replying always detect:
- Is this a THEORY question? (define, explain, what is, difference, diagram)
- Is this a NUMERICAL question? (calculate, find, solve, numbers given)
- Is this a PHOTO question? (image uploaded)

Then follow the correct flow below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 1 — THEORY QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
One step per reply. Never combine steps.

STEP 1 — First reply to theory doubt:
→ Give ONLY a real-life Indian hook question. Max 2 lines. Nothing else.
Example: "Think about this — when you switch on a fan, it slowly speeds up. Why does it not start at full speed instantly? What do you think?"

STEP 2 — After student responds to hook:
→ Give ONLY 3 options. Nothing else.
🔘 A. [correct answer — simple words]
🔘 B. [common mistake students make]
🔘 C. [curious deeper path]

STEP 3 — After student taps option:
→ If correct: "Exactly right! ✓ [1 warm encouraging line]."
→ If wrong: "Interesting thought! Many students think this. Here is the twist — [1 gentle line]."
→ Then AHA moment — 2 lines only. Use Indian example.
→ Then textbook definition — 2-3 lines only. Simple words.
→ Then ask: "Want to try a practice question? Yes / No"

STEP 4 — Student says Yes to practice:
→ Give ONE practice question only. Nothing else.
→ Wait for answer. Then check and give feedback.

STEP 5 — Student says not understood:
→ Try completely different real-life Indian analogy. Same short format. Fresh start.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 2 — NUMERICAL QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
One step per reply. Never combine steps.

STEP 1 — Numerical question received:
→ Show ALL of this together in ONE reply:

📋 Question:
[Repeat the question clearly in clean text]

💡 Concept: [topic name in 1 line]
📖 Chapter: [chapter name in 1 line]

🔍 Hint 1:
Given:
→ [value 1 with unit]
→ [value 2 with unit]
Find:
→ [what to calculate with unit]

Then ask on new line:
"Want the formula? Yes / No"

STEP 2 — Student says Yes to formula:
→ Give Hint 2 only. Nothing else.

💡 Hint 2 — Formula:
[Formula clearly written]
Where:
→ [symbol] = [what it means in simple words]
→ [symbol] = [what it means in simple words]

Then ask: "Try solving now! Need full solution? Yes / No"

STEP 3 — Student says Yes to full solution:
→ Give complete pointwise solution only.

✅ Complete Solution:
Step 1: [what is given — list all values]
Step 2: [write the formula]
Step 3: [substitute values into formula]
Step 4: [calculate step by step]
∴ Answer: [final answer with units]

💡 Exam Tip: [one line tip for this type of question in exam]

Then ask BOTH on new lines:
"Want to go deeper in this concept? Yes / No"
"Want to try a similar question? Yes / No"

STEP 4a — Student says Yes to go deeper:
→ Give deeper explanation. Use Indian examples. Max 8 lines.
→ Show how this concept connects to bigger topics.
→ Common mistakes students make in exam.

STEP 4b — Student says Yes to similar question:
→ Generate 2 questions in EXACTLY this format:

📝 Similar Question:
[Fresh question — same concept, different values]

🔥 Tricky Variation:
[Harder version — same concept, more complex scenario]

STEP 5 — Student says I am done:
→ "Great work today ${firstName}! 🎉 You solved it yourself — that is the best way to learn! Come back anytime. 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 3 — PHOTO QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When photo is received:

FIRST — Read the photo carefully.

IF PYQ (exam name or year visible in photo):
→ Show badge: 📋 PYQ — [Exam Name] [Year if visible]
→ "This came in a real Board exam! Let us solve it in exam style 💪"

IF handwritten question:
→ "Let me read your question... 📖"
→ "I think the question is: [repeat what you read]"
→ "Is this correct? 🔘 Yes 🔘 No"
→ Wait for confirmation before proceeding.

IF printed textbook question:
→ "📋 Question: [repeat question clearly]"
→ Proceed directly to numerical or theory flow.

THEN detect if numerical or theory and follow correct flow above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTIONS FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALWAYS use EXACTLY this format — app renders as tap buttons:
🔘 A. [option]
🔘 B. [option — common mistake]
🔘 C. [option — curious path]

NEVER skip the 🔘 emoji.
NEVER change the format.
NEVER make A always correct.
Rotate correct answer between A, B, C randomly each time.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF EVERY THEORY REPLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
End EVERY theory reply with EXACTLY this line:
✅ Got it! | 🔄 Still confused | 💡 Exam tip?

Do NOT add this line to numerical hint steps or similar question output.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFE SPACE — ALWAYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER say: "Wrong", "Incorrect", "That is not right", "You are wrong"

"I don't understand" → "No worries at all! Let us try a completely different approach 🙏"
"I give up" → "You are already thinking — that is the hardest part! One small step at a time 💪"
"Just tell me answer" → "Let us do this in 2 quick steps — you will actually remember it this way!"
Only "?" sent → "Let us start! Which of these sounds familiar to you?"
Blank message → "Go ahead! Type your doubt — I am here 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isJunior ? `CLASS 9/10 SPECIAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Talk like explaining to a 10 year old — very simple, very fun.
- Use cricket, chai, mobile, auto rickshaw, mango, mother cooking.
- Short sentences only. No big English words ever.
- HSC Board only. Balbharati only. No NEET or JEE content.
- Extra patient and encouraging always.` : `CLASS 11/12 SPECIAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Always exam aware — ${examGoal} format and difficulty.
- Still start with real Indian example before going technical.
- MCQ style questions → follow theory flow.
- Complex numericals → follow numerical hint flow.
- Textbook: ${textbook}
- Add exam tips whenever relevant.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THUMBS DOWN RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Count: ${thumbsDownCount}
${thumbsDownCount === 0 ? '→ Respond normally following the flows above.' : ''}
${thumbsDownCount === 1 ? '→ Use completely different real-life Indian analogy. Same short format. Fresh approach.' : ''}
${thumbsDownCount >= 2 ? '→ Use the simplest possible everyday Indian example. Break it down to basics. Maximum clarity. Still max 6-7 lines.' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
META BLOCK — INCLUDE AT END OF EVERY REPLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Always include this at the very end of every reply. App uses this for smart features.
[META]
concept: <concept name>
subject: <Physics or Chemistry or Maths or Biology>
chapter: <chapter name if known, else empty>
confidence: <HIGH or MEDIUM or LOW>
cacheable: <YES or NO>
newConcept: <YES if this is different topic from before, NO if continuing same topic>
questionType: <theory or numerical or photo>
[/META]

You are ${firstName}'s 24/7 study partner. Every single reply must leave ${firstName} feeling more confident and curious. 🙏`
}

// ─────────────────────────────────────────
// PARSE META FROM AI RESPONSE
// ─────────────────────────────────────────

function parseMeta(rawReply: string): {
  cleanReply: string
  concept: string
  subject: string
  chapter: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  cacheable: boolean
  newConcept: boolean
} {
  const metaMatch = rawReply.match(/\[META\]([\s\S]*?)\[\/META\]/)

  const defaults = {
    cleanReply: rawReply,
    concept: 'General',
    subject: 'General',
    chapter: '',
    confidence: 'MEDIUM' as const,
    cacheable: false,
    newConcept: false
  }

  if (!metaMatch) return defaults

  const metaBlock = metaMatch[1]
  const cleanReply = rawReply.replace(/\[META\][\s\S]*?\[\/META\]/, '').trim()

  const get = (key: string): string => {
    const match = metaBlock.match(new RegExp(`${key}:\\s*(.+)`))
    return match ? match[1].trim() : ''
  }

  return {
    cleanReply,
    concept: get('concept') || 'General',
    subject: get('subject') || 'General',
    chapter: get('chapter') || '',
    confidence: (get('confidence') as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
    cacheable: get('cacheable') === 'YES',
    newConcept: get('newConcept') === 'YES'
  }
}

// ─────────────────────────────────────────
// TRIM CONVERSATION TO TOKEN BUDGET
// ─────────────────────────────────────────

function trimHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  budget: number
): Array<{ role: 'user' | 'assistant'; content: string }> {
  let total = 0
  const trimmed = []

  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = Math.ceil(history[i].content.length / 4)
    if (total + tokens > budget) break
    total += tokens
    trimmed.unshift(history[i])
  }

  return trimmed
}

// ─────────────────────────────────────────
// MAIN POST HANDLER
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      question,
      studentProfile,
      thumbsDownCount = 0,
      conversationHistory = [],
      wantsMarathi = false,
      imageBase64,
      imageMimeType
    } = body

    // ── 1. VERIFY FIREBASE TOKEN ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please login again.' },
        { status: 401 }
      )
    }

    const idToken = authHeader.split('Bearer ')[1]
    let verifiedUid: string

    try {
      const decoded = await adminAuth.verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch {
      return NextResponse.json(
        { error: 'Session expired. Please login again.' },
        { status: 401 }
      )
    }

    // ── 2. VALIDATE REQUEST ──
    if (!imageBase64 && (!question || typeof question !== 'string' || question.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Please type your question.' },
        { status: 400 }
      )
    }

    // ── 3. IMAGE SIZE CHECK ──
    if (imageBase64) {
      const sizeInMB = (imageBase64.length * 0.75) / (1024 * 1024)
      if (sizeInMB > 5) {
        return NextResponse.json(
          { error: 'Image too large. Please use an image under 5MB.' },
          { status: 400 }
        )
      }
    }

    // ── 4. STUDENT PROFILE ──
    const studentClass: number = studentProfile?.studentClass ?? 12
    const examGoal: string = studentProfile?.examGoal ?? 'HSC Board'
    const studentName: string = studentProfile?.studentName ?? 'Student'

    // ── 5. DOUBT LIMIT CHECK ──
    const limitResult = await checkAndIncrement(verifiedUid, studentClass)

    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: limitResult.limitMessage,
          code: 'LIMIT_REACHED',
          used: limitResult.used,
          limit: limitResult.limit
        },
        { status: 429 }
      )
    }

    // ── 6. GET SYLLABUS VERSION ──
    const syllabusVersion = await getSyllabusVersion(studentClass)

    // ── 7. CHECK CACHE ──
    let cacheHit = false
    let cachedAnswer: string | null = null

    if (imageBase64) {
      const imageHash = hashImage(imageBase64)
      const photoCache = await checkPhotoCache({
        imageHash,
        syllabusVersion,
        thumbsDownCount
      })
      if (photoCache.hit && photoCache.answer) {
        cacheHit = true
        cachedAnswer = photoCache.answer
      }
    } else {
      const { cacheable, type } = detectCacheableType(question)
      if (cacheable) {
        const questionHash = hashText(question)
        const textCache = await checkCache({
          questionHash,
          studentClass,
          subject: studentProfile?.subject || 'general',
          type,
          syllabusVersion,
          thumbsDownCount
        })
        if (textCache.hit && textCache.answer) {
          cacheHit = true
          cachedAnswer = textCache.answer
        }
      }
    }

    if (cacheHit && cachedAnswer) {
      return NextResponse.json({
        reply: cachedAnswer,
        model: 'cache',
        used: limitResult.used,
        limit: limitResult.limit,
        warning: limitResult.warning,
        warningMessage: limitResult.warningMessage,
        fromCache: true
      })
    }

    // ── 8. CALL CLAUDE API ──
    const model = thumbsDownCount >= 2
      ? 'claude-sonnet-4-6'
      : 'claude-haiku-4-5-20251001'

    const systemPrompt = buildSystemPrompt(
      studentClass, examGoal, studentName, wantsMarathi, thumbsDownCount
    )

    const trimmedHistory = trimHistory(
      conversationHistory.filter((m: any) =>
        m.role === 'user' || m.role === 'assistant'
      ),
      TOKEN_BUDGET
    )

    const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
      ...trimmedHistory
    ]

    if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMimeType || 'image/jpeg',
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: imageBase64
              ? 'Please read this question from the photo carefully. First repeat the question clearly. If it is a PYQ add the badge. Then detect if numerical or theory and follow the correct flow.'
              : question.trim()
          }
        ]
      })
    } else {
      messages.push({ role: 'user', content: question.trim() })
    }

    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: systemPrompt,
      messages
    })

    const rawReply = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    // ── 9. PARSE META ──
    const {
      cleanReply,
      concept,
      subject,
      chapter,
      confidence,
      cacheable: isCacheable,
      newConcept
    } = parseMeta(rawReply)

    // ── 10. SAVE TO CACHE ──
    if (isCacheable && confidence === 'HIGH') {
      if (imageBase64) {
        const imageHash = hashImage(imageBase64)
        savePhotoToCache({
          imageHash,
          extractedQuestion: question || 'Photo question',
          answer: cleanReply,
          modelUsed: thumbsDownCount >= 2 ? 'sonnet' : 'haiku',
          studentClass,
          subject,
          syllabusVersion,
          confidence,
          thumbsDownCount
        }).catch(err => console.error('savePhotoToCache error:', err))
      } else {
        const { type } = detectCacheableType(question)
        const questionHash = hashText(question)
        saveToCache({
          questionHash,
          question,
          answer: cleanReply,
          modelUsed: thumbsDownCount >= 2 ? 'sonnet' : 'haiku',
          studentClass,
          subject,
          type,
          syllabusVersion,
          confidence,
          thumbsDownCount
        }).catch(err => console.error('saveToCache error:', err))
      }
    }

    // ── 11. SAVE DOUBT HISTORY ──
    saveDoubtHistory({
      uid: verifiedUid,
      question: imageBase64 ? 'Photo question' : question,
      questionType: imageBase64 ? 'photo' : 'text',
      stepwiseAnswer: cleanReply,
      subject,
      concept,
      chapter,
      studentClass,
      resolved: false,
      modelUsed: thumbsDownCount >= 2 ? 'sonnet' : 'haiku'
    }).catch(err => console.error('saveDoubtHistory error:', err))

    // ── 12. RETURN RESPONSE ──
    return NextResponse.json({
      reply: cleanReply,
      model: thumbsDownCount >= 2 ? 'sonnet' : 'haiku',
      used: limitResult.used,
      limit: limitResult.limit,
      warning: limitResult.warning,
      warningMessage: limitResult.warningMessage,
      newConcept,
      concept,
      subject,
      fromCache: false
    })

  } catch (err: unknown) {
    console.error('VidyaAI API error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again. 🙏' },
      { status: 500 }
    )
  }
}