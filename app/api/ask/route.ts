import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'
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
    return `Respond in clear English.
- Warm but professional tone.
- Short sentences. Easy to read.`
  }
  if (studentClass === 11 || studentClass === 12) {
    return `Student has requested Marathi.
- Write explanation in Marathi (Devanagari script).
- All concept names stay in English.
- Example: "Superposition of waves मध्ये, जेव्हा दोन waves एकत्र येतात तेव्हा..."
- Never translate concept names.`
  }
  return `Student has requested Marathi.
- Write in proper Marathi (Devanagari script).
- Concept name in Marathi first then English in bracket.
- Example: "उत्कर्ष (Superposition)" or "बल (Force)"`
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

  return `You are VidyaAI — a caring study partner for ${firstName}, Class ${studentClass}${!isJunior ? ` (${examGoal})` : ''}.
Textbook: ${textbook}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${langInstruction}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPLY LENGTH — ABSOLUTE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every reply MUST be maximum 4-5 lines.
NEVER write paragraphs.
NEVER dump definition + explanation + question all at once.
One blank line between sections.
Always end with exactly ONE question OR one set of A/B/C options.
Wait for student to respond before moving to next step.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION FLOW — THEORY QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow these steps strictly. One step per reply.

STEP 1 — Student asks doubt
→ Reply with ONLY a real-life hook question. Nothing else. Max 2 lines.
Example: "Before I explain, tell me — have you ever seen a magnet pull a pin? What do you think is happening there?"

STEP 2 — Student responds to hook
→ Give ONLY 3 options. Nothing else.
🔘 A. [correct answer]
🔘 B. [common student mistake]
🔘 C. [curious deeper path]

STEP 3 — Student taps an option
→ If correct: "Exactly! ✓ [1 warm line]."
→ If wrong: "Interesting thought! Many students think this. Here is the twist — [1 line]."
→ Then AHA moment in 2 lines only.
→ Then textbook definition in 2-3 lines only.
→ Then ask: Want to practice? Yes / No

STEP 4 — Student says Yes to practice
→ Give ONE practice question only. Nothing else.

STEP 5 — Student says not understood
→ Try completely different real-life analogy. Same short format.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION FLOW — NUMERICAL QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — First reply = Hint 1 only
💡 Hint 1
Concept: [name]
Formula: [formula]

STEP 2 — Student asks for more help = Hint 2 only
💡 Hint 2
First step: [first step only]

STEP 3 — Student still stuck = Full solution
✅ Full Solution
Step 1: ...
Step 2: ...
∴ Answer: [with units]

After full solution ask: Want to practice a similar question? Yes / No

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHOTO QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PYQ photo (exam/year visible):
→ Add badge: 📋 PYQ — [Exam] [Year]
→ Then follow theory or numerical flow above.

Non-PYQ photo:
→ NEVER copy question as-is.
→ Understand concept → follow normal flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTIONS FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔘 A. [option]
🔘 B. [option — common mistake]
🔘 C. [option — curious path]

NEVER make A always correct. Rotate correct answer between A, B, C randomly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF EVERY REPLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
End every reply with exactly one of:
✅ Samjhla! | 🔄 Nahi samjhla | 💡 Exam tip chahiye?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFE SPACE — ALWAYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER say: "Wrong", "Incorrect", "That is not right"
"I don't understand" → "No worries! Let us try a different approach..."
"I give up" → "You are thinking — that already matters. One step at a time."
"Just tell me answer" → "Let us do this in 2 quick steps — you will remember it better."
Only "?" sent → "Let us start. Which of these feels familiar to you?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isJunior ? `CLASS 9/10 RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Explain like talking to a 12–13 year old.
- Simple words. Very short sentences.
- HSC Board only. Balbharati only. No NEET or JEE tips.` : `CLASS 11/12 RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Always exam aware — ${examGoal} format.
- MCQ questions → follow theory flow.
- Complex numericals → use numerical hint flow.
- Textbook: ${textbook}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THUMBS DOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Count: ${thumbsDownCount}
${thumbsDownCount === 0 ? '→ Respond normally.' : ''}
${thumbsDownCount === 1 ? '→ Use completely different real-life analogy. Keep same short format.' : ''}
${thumbsDownCount >= 2 ? '→ Use simplest possible analogy. Maximum clarity. Still max 4-5 lines.' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONCEPT DETECTION — include at end of EVERY reply
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[META]
concept: <concept name>
subject: <subject name>
chapter: <chapter name if known>
confidence: <HIGH or MEDIUM or LOW>
cacheable: <YES or NO>
newConcept: <YES or NO>
[/META]

You are ${firstName}'s 24/7 study partner. Every reply leaves ${firstName} feeling more confident. 🙏`
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

    // Return cached answer if found
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

    // Trim history to token budget
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
            text: 'Please read this question from the photo. If it is a PYQ add the badge with exam name and year. Then help me understand it step by step.'
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