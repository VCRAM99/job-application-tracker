import { canonicalSkill } from "@/lib/analyze/facts"
import { newNumbers } from "@/lib/ai/verify/numbers"
import { MENTIONED_SKILLS } from "@/lib/jobs/normalize"

/**
 * Lexical checks that a generated text adds no number, name, title, date,
 * degree, or certification its sources do not contain. Moved from the M4
 * tailoring validator; `checkRewrite` is byte-for-byte the M4 check.
 */
export type ClaimDropReason = "new_number" | "new_name" | "new_title" | "new_credential"

const CREDENTIAL =
  /\b(b\.?sc|m\.?sc|b\.?s|m\.?s|b\.?a|m\.?a|b\.?eng|m\.?eng|ph\.?d|mba|bachelor'?s?|master'?s?|doctorate|degree|diploma|certified|certificate|certification|license[ds]?|pmp|cpa|cfa|cissp|cism|cisa|ceh|ccna|ccnp|ckad|cka|cks|comptia|mcse|itil|csm|award|awarded|awards|winner|won|patent|patents|patented|promoted|promotion|published|publication|keynote|fellowship|scholarship)\b/gi
const TITLE =
  /\b(senior|sr|staff|principal|lead|manager|director|head|chief|vp|vice president|president|architect|founder|co-?founder|cto|ceo|cfo|coo|supervisor|owner|partner|coordinator|intern|executive|officer|chair|chairman)\b/gi

/** Lowercase employer and technology names: a rewrite cannot slip in "at google" or "kubernetes". */
const ENTITY_NAMES = new Set([
  ...MENTIONED_SKILLS.map((skill) => canonicalSkill(skill)),
  ...["kubernetes", "terraform", "docker", "spark", "snowflake", "salesforce", "sap", "tableau", "figma", "jira", "kafka", "graphql"].map(canonicalSkill),
  "google", "alphabet", "amazon", "meta", "facebook", "microsoft", "apple", "netflix", "stripe", "uber", "airbnb", "openai", "anthropic",
  "nvidia", "ibm", "oracle", "shopify", "twitter", "linkedin", "tesla", "spotify", "adobe", "intel", "cisco", "deloitte", "accenture",
  "mckinsey", "goldman", "jpmorgan", "faang", "fortune",
])

/** Words a rewritten bullet may start with that are not names. */
const LEAD_WORDS = new Set(
  (
    "a an the as at by for in on to with and or our my we i this that these those over across after before during while when " +
    "accelerated achieved added advised analyzed architected assessed automated built championed coached collaborated completed " +
    "configured consolidated contributed coordinated created cut debugged decreased defined delivered deployed designed developed " +
    "directed documented drove eliminated enabled engineered established evaluated expanded facilitated grew guided handled hardened " +
    "identified implemented improved increased instrumented integrated introduced launched led lowered maintained managed mentored " +
    "migrated modernized monitored moved negotiated optimized orchestrated organized owned partnered piloted planned prioritized " +
    "processed produced profiled prototyped published raised rebuilt redesigned reduced refactored released replaced resolved " +
    "restructured revamped reviewed scaled secured shipped simplified sped spearheaded standardized streamlined strengthened " +
    "supported tested trained transformed tuned unified upgraded used validated wrote"
  ).split(" "),
)
const MONTH = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/gi

function wordsIn(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0].toLowerCase().replace(/\./g, ""))
}

function words(text: string): string[] {
  return (text.normalize("NFKC").match(/\p{L}[\p{L}\p{N}+#.&'-]*/gu) ?? []).map((word) => word.replace(/[.'-]+$/, ""))
}

/**
 * Words that look like names: capitalized words and acronyms after the first
 * word, a first word that is not a common lead word, and any lowercase word
 * that is a known employer or technology.
 */
function nameCandidates(text: string): string[] {
  const all = words(text)
  const names = all.slice(1).filter((word) => /^\p{Lu}/u.test(word) && word.length > 1)
  const first = all[0]
  if (first && !LEAD_WORDS.has(first.toLowerCase())) names.push(first)
  for (const word of all) if (ENTITY_NAMES.has(canonicalSkill(word))) names.push(word)
  return names
}

/**
 * The checks for one rewritten text against the original and the cited
 * facts. Returns the first reason it fails, or null when it passes.
 */
export function checkRewrite(before: string, after: string, citedFacts: string[]): ClaimDropReason | null {
  const sources = [before, ...citedFacts]
  const sourceText = sources.join("\n")
  const lowerSources = sourceText.toLowerCase()
  if (newNumbers(after, sources).length > 0) return "new_number"
  if (wordsIn(CREDENTIAL, after).some((word) => !wordsIn(CREDENTIAL, sourceText).includes(word))) return "new_credential"
  if (wordsIn(TITLE, after).some((word) => !wordsIn(TITLE, sourceText).includes(word))) return "new_title"
  if (wordsIn(MONTH, after).some((word) => !lowerSources.includes(word))) return "new_number"
  const known = new Set(words(sourceText).map((word) => word.toLowerCase()))
  const knownSkills = new Set(words(sourceText).map(canonicalSkill))
  if (nameCandidates(after).some((word) => !known.has(word.toLowerCase()) && !knownSkills.has(canonicalSkill(word)))) return "new_name"
  return null
}


/** Words that may start a sentence in a message without being read as a name. */
const SENTENCE_STARTERS = new Set(
  (
    "i i'm i've i'd i'll im hi hello hey dear thanks thank thankyou best regards sincerely cheers warmly kind kindly please " +
    "would could can may might should will if since given because although though while hope hoping looking happy glad excited " +
    "great nice good congratulations congrats it it's its there here what how why when where who which do does did is are was were " +
    "have has had my your our their his her its me you we they he she one some many most several each every both all also again " +
    "lately recently currently previously today yesterday tomorrow then next first finally overall otherwise however still yet so " +
    "just quick quickly briefly no not yes sure absolutely appreciate appreciated really truly honestly let let's lets talk tell " +
    "describe walk explain share give imagine suppose consider name think say pick focus start try add keep cut lead state open " +
    "close mention structure strengthen make use avoid aim end follow note being having after before during about across around " +
    "situation task action result outcome context challenge impact goal role question answer feedback relevance specificity length"
  ).split(" "),
)

/** Capitalized words that are not names wherever they appear. */
const ALWAYS_PLAIN = new Set(["I'm", "I've", "I'd", "I'll", "OK", "STAR"])

/** Text after "at", "for", or "with" reads as the user's employer when one of these comes before it. */
const EMPLOYMENT_CUE = /\b(worked|joined|employed|interned|tenure|served|spent|while|during|previously|formerly|former|ex|was|been)\b/

/** A sentence about the user or the user's team. */
export const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself|we|we've|we're|our|ours|us)\b/i

const SELF_TITLE = /\b(i am|i'm|im|i was|i've been|i have been|i'll be|i will be)\s+(?:an?\s+|the\s+|your\s+)?$|\b(?:i|my)\b(?:\s+\S+){0,3}\s+as\s+(?:an?\s+|the\s+)?$/
const TITLE_AFTER = /^\s*(role|position|opening|job|posting|req|requisition|team|interview|opportunity|opening)s?\b/
const TITLE_BEFORE = /\b(your|the|this|that|a|an)\s+$/

/** Splits on sentence ends and line breaks. Abbreviations can split a sentence early; both halves are still checked. */
export function splitSentences(text: string): string[] {
  return text
    .normalize("NFKC")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function sentenceNames(sentence: string): Array<{ word: string; index: number }> {
  const found: Array<{ word: string; index: number }> = []
  const pattern = /\p{L}[\p{L}\p{N}+#.&'-]*/gu
  let first = true
  for (const match of sentence.normalize("NFKC").matchAll(pattern)) {
    const word = match[0].replace(/[.'-]+$/, "")
    const index = match.index ?? 0
    if (ALWAYS_PLAIN.has(word)) {
      first = false
      continue
    }
    if (first) {
      if (!SENTENCE_STARTERS.has(word.toLowerCase()) && !LEAD_WORDS.has(word.toLowerCase())) found.push({ word, index })
    } else if (/^\p{Lu}/u.test(word) && word.length > 1) {
      found.push({ word, index })
    }
    if (ENTITY_NAMES.has(canonicalSkill(word)) && !found.some((item) => item.index === index)) found.push({ word, index })
    first = false
  }
  return found
}

function contextTitleSpans(sentence: string, phrases: string[]): Array<[number, number]> {
  const lower = sentence.toLowerCase()
  const spans: Array<[number, number]> = []
  for (const phrase of phrases) {
    const key = phrase.toLowerCase().replace(/\s+/g, " ").trim()
    if (!key) continue
    let from = 0
    for (;;) {
      const start = lower.indexOf(key, from)
      if (start < 0) break
      const end = start + key.length
      from = end
      const before = lower.slice(0, start)
      const after = lower.slice(end)
      const bounded = !/[\p{L}\p{N}]$/u.test(before) && !/^[\p{L}\p{N}]/u.test(after)
      if (bounded && (TITLE_AFTER.test(after) || TITLE_BEFORE.test(before)) && !SELF_TITLE.test(before)) spans.push([start, end])
    }
  }
  return spans
}

export type ClaimPolicy = {
  /** Text about the user: cited verified facts, and for coaching notes the user's own answer. */
  evidence: string[]
  /**
   * Text about the job, contact, or company. It may supply names (but not as
   * the user's employer), and title words only inside the job or contact
   * title phrase when that phrase is not claimed as the user's own.
   */
  context?: string[]
  /** Title phrases from the job or the contact, for the rule above. */
  contextTitles?: string[]
  /** Interview questions describe the job, so context counts as evidence for every check. */
  contextIsEvidence?: boolean
}

/**
 * Checks one sentence of generated text. Numbers, months, and credential
 * words must come from evidence. Title words must come from evidence unless
 * they sit inside a job or contact title phrase. Names may come from either,
 * except that a name only found in context cannot follow an employment cue.
 */
export function checkSentence(sentence: string, policy: ClaimPolicy): ClaimDropReason | null {
  const context = policy.context ?? []
  const evidence = policy.contextIsEvidence ? [...policy.evidence, ...context] : policy.evidence
  const evidenceText = evidence.join("\n")
  const allText = [...policy.evidence, ...context].join("\n")
  if (newNumbers(sentence, evidence).length > 0) return "new_number"
  const evidenceCredentials = wordsIn(CREDENTIAL, evidenceText)
  if (wordsIn(CREDENTIAL, sentence).some((word) => !evidenceCredentials.includes(word))) return "new_credential"
  const lowerEvidence = evidenceText.toLowerCase()
  if (wordsIn(MONTH, sentence).some((word) => !lowerEvidence.includes(word))) return "new_number"
  const evidenceTitles = wordsIn(TITLE, evidenceText)
  const spans = policy.contextIsEvidence ? [] : contextTitleSpans(sentence, policy.contextTitles ?? [])
  for (const match of sentence.matchAll(TITLE)) {
    const word = match[0].toLowerCase().replace(/\./g, "")
    if (evidenceTitles.includes(word)) continue
    const at = match.index ?? 0
    if (spans.some(([start, end]) => at >= start && at < end)) continue
    return "new_title"
  }
  const evidenceWords = new Set(words(evidenceText).map((word) => word.toLowerCase()))
  const evidenceSkills = new Set(words(evidenceText).map(canonicalSkill))
  const allWords = new Set(words(allText).map((word) => word.toLowerCase()))
  const allSkills = new Set(words(allText).map(canonicalSkill))
  const lower = sentence.toLowerCase()
  for (const { word, index } of sentenceNames(sentence)) {
    const key = word.toLowerCase()
    if (evidenceWords.has(key) || evidenceSkills.has(canonicalSkill(word))) continue
    if (!allWords.has(key) && !allSkills.has(canonicalSkill(word))) return "new_name"
    // A technology or employer from the job cannot become part of a sentence about the user.
    if (FIRST_PERSON.test(sentence) && ENTITY_NAMES.has(canonicalSkill(word))) return "new_name"
    // Known only from the job or contact: it must not read as the user's employer.
    const before = lower.slice(Math.max(0, index - 60), index)
    if (/\b(at|for|with)\s+(the\s+)?$/.test(before) && EMPLOYMENT_CUE.test(before)) return "new_name"
    if (/\b(i|we)\s+(\w+\s+)?work(s|ing)?\s+(at|for|with)\s+(the\s+)?$/.test(before)) return "new_name"
    if (/^\s*at\s+$/.test(lower.slice(0, index)) && /^[^,]*,\s*(i|we)\b/.test(lower.slice(index))) return "new_name"
  }
  return null
}

/** Model-written ratings are not allowed anywhere in coaching output. */
export function mentionsScore(text: string): boolean {
  return /\b\d+(\.\d+)?\s*(\/|out of)\s*\d+\b|\b(score[ds]?|scoring|rating|rated|grade[ds]?|grading|percentile|stars?)\b/i.test(text)
}
