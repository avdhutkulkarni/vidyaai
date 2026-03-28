import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebaseAdmin'
import { checkAndIncrement } from '@/lib/doubtLimit'
import { getSyllabusVersion } from '@/lib/syllabusVersion'
import {
  hashText, hashImage, detectCacheableType,
  checkCache, checkPhotoCache, saveToCache, savePhotoToCache,
  getTopExamples, getThumbsDownAnalysis
} from '@/lib/cache'
import { saveDoubtHistory } from '@/lib/doubtHistory'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TOKEN_BUDGET = 4000
export const dynamic = 'force-dynamic'

function getTextbook(examGoal: string): string {
  if (['NEET', 'JEE Mains', 'JEE Advanced'].includes(examGoal)) return 'NCERT (primary) and Balbharati (secondary)'
  return 'Balbharati'
}

function getLanguageInstruction(studentClass: number, wantsMarathi: boolean): string {
  if (!wantsMarathi) return `Respond in simple clear English only.\n- Talk like a friendly elder brother or sister.\n- Very short sentences. Very easy words.\n- Difficult word? Explain it in brackets.`
  if (studentClass === 11 || studentClass === 12) return `Student wants Marathi.\n- Write in Marathi (Devanagari script).\n- All concept names and formulas stay in English.\n- Example: "Newton चा नियम सांगतो की जेव्हा ball ला force लागतो..."\n- Never translate scientific terms.`
  return `Student wants Marathi.\n- Write in simple Marathi (Devanagari script).\n- Concept name in Marathi first then English in bracket.\n- Example: "बल (Force)" or "वेग (Velocity)"`
}

async function buildLearningContext(studentClass: number, subject: string, syllabusVersion: string): Promise<string> {
  try {
    const [topExamples, thumbsDownExamples] = await Promise.all([
      getTopExamples({ studentClass, subject, syllabusVersion }),
      getThumbsDownAnalysis({ studentClass, subject, syllabusVersion })
    ])
    let context = ''
    if (topExamples.length > 0) {
      context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTOP RATED EXPLANATIONS — LEARN FROM THESE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThese answers got the most thumbs up from real students. Study their language, tone, format and Indian examples. Match this quality and style.\n\n`
      topExamples.slice(0, 10).forEach((ex, i) => { context += `Example ${i + 1} (${ex.thumbsUpCount} thumbs up):\nQ: ${ex.question}\nA: ${ex.answer}\n\n` })
    }
    if (thumbsDownExamples.length > 0) {
      context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPOORLY RATED EXPLANATIONS — AVOID THESE PATTERNS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThese got thumbs down. Analyse WHY. Avoid similar language and patterns.\n\n`
      thumbsDownExamples.slice(0, 5).forEach((ex, i) => { context += `Bad Example ${i + 1} (${ex.flagCount} thumbs down):\nQ: ${ex.question}\nA: ${ex.answer}\n\n` })
    }
    return context
  } catch (err) {
    return ''
  }
}

function buildSystemPrompt(studentClass: number, examGoal: string, studentName: string, wantsMarathi: boolean, thumbsDownCount: number, learningContext: string): string {
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
- Use ONLY real Indian life examples: cricket match, chai getting cold, mobile charging, auto rickshaw, mother cooking on gas, mango falling from tree, school bell, rain on window, train on track, kite flying, ceiling fan, pressure cooker.
- Very simple words. Short sentences. Never sound like a textbook.
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
- NEVER write long paragraphs. NEVER dump everything at once.
- One blank line between sections.
- Always end with exactly ONE question OR one set of A/B/C options.
- Wait for student to respond before moving to next step.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETECT QUESTION TYPE FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- THEORY question? (define, explain, what is, difference, diagram)
- NUMERICAL question? (calculate, find, solve, numbers given)
- PHOTO question? (image uploaded)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 1 — THEORY QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 → Give ONLY a real-life Indian hook question. Max 2 lines. Nothing else.
STEP 2 → Give ONLY 3 options:
🔘 A. [correct answer — simple words]
🔘 B. [common mistake students make]
🔘 C. [curious deeper path]
STEP 3 → After option tapped:
→ Correct: "Exactly right! ✓ [1 warm line]."
→ Wrong: "Interesting thought! Many students think this. Here is the twist — [1 gentle line]."
→ AHA moment — 2 lines. Indian example.
→ Textbook definition — 2-3 lines. Simple words.
→ Ask: "Want to try a practice question? Yes / No"
STEP 4 → Yes to practice → Give ONE practice question only.
STEP 5 → Not understood → Completely different Indian analogy. Same short format.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 2 — NUMERICAL QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 → Show ALL together in ONE reply:
📋 Question: [Repeat clearly]
💡 Concept: [topic 1 line]
📖 Chapter: [chapter 1 line]
🔍 Hint 1:
Given: → [value with unit] → [value with unit]
Find: → [what to calculate]
Then ask: "Want the formula? Yes / No"

STEP 2 → Yes to formula:
💡 Hint 2 — Formula: [Formula clearly]
Where: → [symbol] = [meaning] → [symbol] = [meaning]
Then ask: "Try solving now! Need full solution? Yes / No"

STEP 3 → Yes to full solution:
✅ Complete Solution:
Step 1: [given values]
Step 2: [formula]
Step 3: [substitute]
Step 4: [calculate]
∴ Answer: [value with units]
💡 Exam Tip: [one line]
Then ask: "Want to go deeper? Yes / No" and "Want similar question? Yes / No"

STEP 4a → Deeper → explanation Max 8 lines. Indian examples. Common exam mistakes.
STEP 4b → Similar question →
📝 Similar Question: [same concept different values]
🔥 Tricky Variation: [harder version]
STEP 5 → Done → "Great work today ${firstName}! 🎉 You solved it yourself — best way to learn! Come back anytime. 🙏"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLOW 3 — PHOTO QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IF PYQ → Show badge: 📋 PYQ — [Exam Name] [Year] → "This came in real Board exam! Let us solve it 💪"
IF handwritten → "Let me read your question... 📖" → "I think the question is: [read]" → "Is this correct? 🔘 Yes 🔘 No"
IF printed → "📋 Question: [repeat clearly]" → proceed to numerical or theory flow.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTIONS FORMAT — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALWAYS use EXACTLY this format:
🔘 A. [option]
🔘 B. [option — common mistake]
🔘 C. [option — curious path]
NEVER skip 🔘. NEVER make A always correct. Rotate correct answer randomly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF EVERY THEORY REPLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
End EVERY theory reply with: ✅ Got it! | 🔄 Still confused | 💡 Exam tip?
Do NOT add this to numerical hint steps.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFE SPACE — ALWAYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER say: "Wrong", "Incorrect", "That is not right", "You are wrong"
"I don't understand" → "No worries! Let us try a different approach 🙏"
"I give up" → "You are already thinking — that is the hardest part! One step at a time 💪"
"Just tell me answer" → "Let us do this in 2 quick steps — you will remember it better!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isJunior ? `CLASS 9/10 RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Talk like explaining to a 10 year old — very simple, very fun.
- Cricket, chai, mobile, auto rickshaw, mango, mother cooking.
- Short sentences only. No big English words.
- HSC Board only. Balbharati only. No NEET or JEE content.
- Extra patient and encouraging always.` : `CLASS 11/12 RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Always exam aware — ${examGoal} format and difficulty.
- Start with real Indian example before going technical.
- MCQ questions → theory flow. Complex numericals → numerical flow.
- Textbook: ${textbook}. Add exam tips whenever relevant.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THUMBS DOWN RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Count: ${thumbsDownCount}
${thumbsDownCount === 0 ? '→ Respond normally.' : ''}
${thumbsDownCount === 1 ? '→ Student not satisfied. Try completely different real-life Indian analogy. Different angle. Same short format.' : ''}
${thumbsDownCount >= 2 ? '→ Student still not satisfied. Use simplest possible everyday Indian example. Break down to absolute basics. Maximum clarity.' : ''}

${learningContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
META BLOCK — EVERY REPLY MUST HAVE THIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[META]
concept: <concept name>
subject: <Physics or Chemistry or Maths or Biology>
chapter: <chapter name if known>
confidence: <HIGH or MEDIUM or LOW>
cacheable: <YES or NO>
newConcept: <YES or NO>
questionType: <theory or numerical or photo>
[/META]

You are ${firstName}'s 24/7 study partner. Every reply must leave ${firstName} feeling more confident and curious. 🙏`
}

function parseMeta(rawReply: string): {
  cleanReply: string; concept: string; subject: string; chapter: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'; cacheable: boolean; newConcept: boolean; questionType: string
} {
  const metaMatch = rawReply.match(/\[META\]([\s\S]*?)\[\/META\]/)
  const defaults = { cleanReply: rawReply, concept: 'General', subject: 'General', chapter: '', confidence: 'MEDIUM' as const, cacheable: false, newConcept: false, questionType: 'theory' }
  if (!metaMatch) return defaults
  const metaBlock = metaMatch[1]
  const cleanReply = rawReply.replace(/\[META\][\s\S]*?\[\/META\]/, '').trim()
  const get = (key: string): string => { const match = metaBlock.match(new RegExp(`${key}:\\s*(.+)`)); return match ? match[1].trim() : '' }
  return {
    cleanReply,
    concept: get('concept') || 'General',
    subject: get('subject') || 'General',
    chapter: get('chapter') || '',
    confidence: (get('confidence') as 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
    cacheable: get('cacheable') === 'YES',
    newConcept: get('newConcept') === 'YES',
    questionType: get('questionType') || 'theory'
  }
}

function trimHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>, budget: number): Array<{ role: 'user' | 'assistant'; content: string }> {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { question, studentProfile, thumbsDownCount = 0, conversationHistory = [], wantsMarathi = false, imageBase64, imageMimeType } = body

    // 1. AUTH
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized. Please login again.' }, { status: 401 })
    const idToken = authHeader.split('Bearer ')[1]
    let verifiedUid: string
    try {
      const decoded = await adminAuth.verifyIdToken(idToken)
      verifiedUid = decoded.uid
    } catch {
      return NextResponse.json({ error: 'Session expired. Please login again.' }, { status: 401 })
    }

    // 2. VALIDATE
    if (!imageBase64 && (!question || typeof question !== 'string' || question.trim().length === 0)) return NextResponse.json({ error: 'Please type your question.' }, { status: 400 })

    // 3. IMAGE SIZE
    if (imageBase64) {
      const sizeInMB = (imageBase64.length * 0.75) / (1024 * 1024)
      if (sizeInMB > 5) return NextResponse.json({ error: 'Image too large. Please use an image under 5MB.' }, { status: 400 })
    }

    // 4. PROFILE
    const studentClass: number = studentProfile?.studentClass ?? 12
    const examGoal: string = studentProfile?.examGoal ?? 'HSC Board'
    const studentName: string = studentProfile?.studentName ?? 'Student'
    const subject: string = studentProfile?.subject || 'general'

    // 5. LIMIT CHECK
    const limitResult = await checkAndIncrement(verifiedUid, studentClass)
    if (!limitResult.allowed) return NextResponse.json({ error: limitResult.limitMessage, code: 'LIMIT_REACHED', used: limitResult.used, limit: limitResult.limit }, { status: 429 })

    // 6. SYLLABUS VERSION
    const syllabusVersion = await getSyllabusVersion(studentClass)

    // 7. CHECK CACHE
    let cacheHit = false
    let cachedAnswer: string | null = null
    if (imageBase64) {
      const imageHash = hashImage(imageBase64)
      const photoCache = await checkPhotoCache({ imageHash, syllabusVersion, thumbsDownCount })
      if (photoCache.hit && photoCache.answer) { cacheHit = true; cachedAnswer = photoCache.answer }
    } else {
      const { cacheable, type } = detectCacheableType(question)
      if (cacheable) {
        const questionHash = hashText(question)
        const textCache = await checkCache({ questionHash, studentClass, subject, type, syllabusVersion, thumbsDownCount })
        if (textCache.hit && textCache.answer) { cacheHit = true; cachedAnswer = textCache.answer }
      }
    }
    if (cacheHit && cachedAnswer) return NextResponse.json({ reply: cachedAnswer, model: 'cache', used: limitResult.used, limit: limitResult.limit, warning: limitResult.warning, warningMessage: limitResult.warningMessage, fromCache: true })

    // 8. SELF-LEARNING CONTEXT
    const learningContext = await buildLearningContext(studentClass, subject, syllabusVersion)
    const systemPrompt = buildSystemPrompt(studentClass, examGoal, studentName, wantsMarathi, thumbsDownCount, learningContext)
    const trimmedHistory = trimHistory(conversationHistory.filter((m: any) => m.role === 'user' || m.role === 'assistant'), TOKEN_BUDGET)
    const isPhoto = !!imageBase64

    // 9. PHOTO FLOW: SONNET READS → HAIKU SOLVES (unless thumbs down >= 2)
    if (isPhoto && thumbsDownCount < 2) {
      // Sonnet reads photo
      const readResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMimeType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Read this photo carefully and extract the question text exactly. If PYQ add badge: 📋 PYQ — [Exam] [Year]. If handwritten confirm with student. Return ONLY the extracted question text.' }
          ]
        }]
      })
      const extractedQuestion = readResponse.content.filter(b => b.type === 'text').map(b => (b as any).text).join('').trim()

      // Haiku solves
      const solveResponse = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [...trimmedHistory, { role: 'user', content: `[Photo question]: ${extractedQuestion}\n\nHelp the student understand this step by step.` }]
      })
      const rawReply = solveResponse.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      const { cleanReply, concept, subject: detSub, chapter, confidence, cacheable, newConcept } = parseMeta(rawReply)

      // Save haiku answer as pending (needs 2 thumbs up)
      if (cacheable && confidence === 'HIGH') {
        savePhotoToCache({ imageHash: hashImage(imageBase64), extractedQuestion, answer: cleanReply, modelUsed: 'haiku', studentClass, subject: detSub, syllabusVersion, confidence, thumbsDownCount }).catch(console.error)
      }
      saveDoubtHistory({ uid: verifiedUid, question: extractedQuestion, questionType: 'photo', stepwiseAnswer: cleanReply, subject: detSub, concept, chapter, studentClass, resolved: false, modelUsed: 'haiku' }).catch(console.error)

      return NextResponse.json({ reply: cleanReply, model: 'haiku', readModel: 'sonnet', used: limitResult.used, limit: limitResult.limit, warning: limitResult.warning, warningMessage: limitResult.warningMessage, newConcept, concept, subject: detSub, fromCache: false })
    }

    // 10. TEXT FLOW OR PHOTO WITH THUMBS DOWN >= 2 (Sonnet solves)
    const finalModel = thumbsDownCount >= 2 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [...trimmedHistory]

    if (isPhoto && thumbsDownCount >= 2) {
      messages.push({ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: imageMimeType || 'image/jpeg', data: imageBase64 } }, { type: 'text', text: 'Read this photo carefully. Repeat the question clearly. If PYQ add badge. Then help the student understand step by step.' }] })
    } else {
      messages.push({ role: 'user', content: question.trim() })
    }

    const response = await client.messages.create({ model: finalModel, max_tokens: 1200, system: systemPrompt, messages })
    const rawReply = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const { cleanReply, concept, subject: detSub, chapter, confidence, cacheable: isCacheable, newConcept } = parseMeta(rawReply)
    const modelUsed = finalModel.includes('sonnet') ? 'sonnet' : 'haiku'

    // 11. SAVE TO CACHE
    if (isCacheable && confidence === 'HIGH') {
      if (isPhoto) {
        savePhotoToCache({ imageHash: hashImage(imageBase64), extractedQuestion: 'Photo question', answer: cleanReply, modelUsed, studentClass, subject: detSub, syllabusVersion, confidence, thumbsDownCount }).catch(console.error)
      } else {
        const { type } = detectCacheableType(question)
        saveToCache({ questionHash: hashText(question), question, answer: cleanReply, modelUsed, studentClass, subject: detSub, type, syllabusVersion, confidence, thumbsDownCount }).catch(console.error)
      }
    }

    // 12. SAVE HISTORY
    saveDoubtHistory({ uid: verifiedUid, question: isPhoto ? 'Photo question' : question, questionType: isPhoto ? 'photo' : 'text', stepwiseAnswer: cleanReply, subject: detSub, concept, chapter, studentClass, resolved: false, modelUsed }).catch(console.error)

    return NextResponse.json({ reply: cleanReply, model: modelUsed, used: limitResult.used, limit: limitResult.limit, warning: limitResult.warning, warningMessage: limitResult.warningMessage, newConcept, concept, subject: detSub, fromCache: false })

  } catch (err: unknown) {
    console.error('VidyaAI API error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again. 🙏' }, { status: 500 })
  }
}