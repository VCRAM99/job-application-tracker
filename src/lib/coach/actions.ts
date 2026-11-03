"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { prepareAiRun, usageReservationDeps } from "@/lib/ai/run-context"
import { AiRequestError } from "@/lib/ai/types"
import { fingerprintOf, loadVerifiedFacts } from "@/lib/analyze/data"
import { requireUser } from "@/lib/auth/session"
import { aiFailure, done, fail, field, idempotencyKey, requestNonce, requestedMode } from "@/lib/coach/action-utils"
import {
  ANSWER_BOUNDS,
  COACH_SCHEMA_VERSION,
  PRACTICE_PROMPT_VERSION,
  QUESTIONS_PROMPT_VERSION,
  STORIES_PROMPT_VERSION,
} from "@/lib/coach/constants"
import { getQuestionSet, loadCoachAnalysis } from "@/lib/coach/data"
import { preparationCategory } from "@/lib/coach/questions"
import { coachAnswer, generateQuestions, generateStories } from "@/lib/coach/run"
import { STORY_FACT_TYPES } from "@/lib/coach/stories"
import { isUuid, type RecordFormState } from "@/lib/records/form-state"
import { sliceChars } from "@/lib/resume/text"
import { createClient } from "@/lib/supabase/server"
import { coachAllowed } from "@/lib/beta"

const OFF = "Career coach is turned off."

function saveFailed(what: string, code: string | undefined): never {
  console.error(`${what} not saved (${code ?? "no code"}).`)
  // Not retryable: a failed save must not call the model again.
  throw new AiRequestError("transient", { retryable: false })
}

/** Generates technical and behavioral questions from a completed analysis's requirements and the user's verified facts. */
export async function generateQuestionSet(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const analysisId = String(formData.get("analysisId") ?? "")
  if (!isUuid(analysisId)) return fail("Choose a completed fit analysis.")
  const analysis = await loadCoachAnalysis(analysisId)
  if (!analysis) return fail("Choose a completed fit analysis.")
  if (analysis.requirements.length === 0) return fail("That analysis has no requirements to practice against.")
  const facts = await loadVerifiedFacts()
  if (!facts.ok) return fail("Verified career facts could not be loaded.")
  const supabase = await createClient()
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const key = idempotencyKey([
    "coach-questions", user.id, analysisId, fingerprintOf(facts.facts), QUESTIONS_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData),
  ])
  let setId: string | null = null
  const result = await generateQuestions({
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
    title: analysis.title,
    company: analysis.company,
    requirements: analysis.requirements,
    facts: facts.facts,
    persist: async (outcome, modelUsed) => {
      const inserted = await supabase
        .from("interview_question_sets")
        .insert({
          application_id: analysis.applicationId,
          analysis_id: analysis.id,
          label: sliceChars([analysis.title || "Interview prep", analysis.company].filter(Boolean).join(" · "), 160),
          questions: outcome.questions,
          dropped: outcome.dropped,
          prompt_version: QUESTIONS_PROMPT_VERSION,
          schema_version: COACH_SCHEMA_VERSION,
          provider: run.provider,
          model: modelUsed,
          execution_mode: run.mode,
        })
        .select("id")
        .single()
      if (inserted.error) saveFailed("Question set", inserted.error.code)
      setId = String(inserted.data.id)
    },
  })
  if (!result.ok) return aiFailure(result.code, result.message)
  if (result.kind === "already-complete") {
    const latest = await supabase
      .from("interview_question_sets")
      .select("id")
      .eq("user_id", user.id)
      .eq("analysis_id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    setId = latest.data ? String(latest.data.id) : null
  }
  if (!setId) return fail("The questions could not be saved. Reload and try again.")
  if (analysis.applicationId) revalidatePath(`/applications/${analysis.applicationId}`)
  redirect(`/interview/${setId}`)
}

/** Adds one question to Preparation, once. The question records the item it created. */
export async function addQuestionToPrep(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  await requireUser()
  const setId = String(formData.get("setId") ?? "")
  const questionId = String(formData.get("questionId") ?? "")
  const set = await getQuestionSet(setId)
  const question = set?.questions.find((item) => item.id === questionId)
  if (!set || !question) return fail("That question could not be found.")
  const supabase = await createClient()
  // One database call locks the set, so a double click cannot create two items.
  const added = await supabase.rpc("add_question_to_preparation", {
    p_set_id: set.id,
    p_question_id: question.id,
    p_title: sliceChars(question.text, 200),
    p_category: preparationCategory(question),
    p_notes: sliceChars(`Interview prep · ${set.label}`, 400),
  })
  if (added.error) return fail("The preparation item could not be created.")
  revalidatePath(`/interview/${set.id}`)
  revalidatePath("/preparation")
  return done((added.data as { created?: boolean } | null)?.created === false ? "Already in Preparation." : "Added to Preparation.")
}

/** Builds or rebuilds the story bank from verified employment, accomplishment, and project facts. */
export async function buildStoryBank(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const facts = await loadVerifiedFacts()
  if (!facts.ok) return fail("Verified career facts could not be loaded.")
  const usable = facts.facts.filter((fact) => STORY_FACT_TYPES.has(fact.type))
  if (usable.length === 0) return fail("Verify at least one employment, project, or accomplishment fact on Career first.")
  const supabase = await createClient()
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const key = idempotencyKey(["coach-stories", user.id, fingerprintOf(usable), STORIES_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData)])
  let kept = 0
  let dropped = 0
  const result = await generateStories({
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
    facts: usable,
    persist: async (outcome, modelUsed) => {
      kept = outcome.stories.length
      dropped = Object.values(outcome.dropped).reduce((sum, value) => sum + value, 0)
      if (outcome.stories.length === 0) return
      const upserted = await supabase.from("story_bank_entries").upsert(
        outcome.stories.map((story) => ({
          user_id: user.id,
          competency: story.competency,
          fact_ids: story.factIds,
          outline: story.outline,
          dropped: outcome.dropped,
          prompt_version: STORIES_PROMPT_VERSION,
          schema_version: COACH_SCHEMA_VERSION,
          provider: run.provider,
          model: modelUsed,
          execution_mode: run.mode,
        })),
        { onConflict: "user_id,competency" },
      )
      if (upserted.error) saveFailed("Story bank", upserted.error.code)
      // A rebuild replaces the bank: competencies the new run did not support are removed.
      const competencies = outcome.stories.map((story) => story.competency)
      await supabase.from("story_bank_entries").delete().eq("user_id", user.id).not("competency", "in", `(${competencies.join(",")})`)
    },
  })
  if (!result.ok) return aiFailure(result.code, result.message)
  revalidatePath("/interview/stories")
  if (result.kind === "already-complete") return done("Already built. Reload to see it.")
  if (kept === 0) return fail(`No outline passed the checks (${dropped} dropped). Your existing stories are unchanged.`)
  return done(`${kept} ${kept === 1 ? "story" : "stories"} saved${dropped ? ` · ${dropped} dropped` : ""}.`)
}

/** Coaches one typed practice answer. The notes are stored with the answer; no score is produced. */
export async function practiceAnswer(_previous: RecordFormState, formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const setId = String(formData.get("setId") ?? "")
  const questionId = String(formData.get("questionId") ?? "")
  const answer = field(formData, "answer", ANSWER_BOUNDS.max + 1)
  if (answer.length < ANSWER_BOUNDS.min) return fail(`Write at least ${ANSWER_BOUNDS.min} characters.`)
  if (answer.length > ANSWER_BOUNDS.max) return fail(`Keep the answer under ${ANSWER_BOUNDS.max.toLocaleString("en-US")} characters.`)
  const set = await getQuestionSet(setId)
  const question = set?.questions.find((item) => item.id === questionId)
  if (!set || !question) return fail("That question could not be found.")
  const analysis = set.analysisId ? await loadCoachAnalysis(set.analysisId) : null
  const facts = await loadVerifiedFacts()
  if (!facts.ok) return fail("Verified career facts could not be loaded.")
  const supabase = await createClient()
  const prepared = await prepareAiRun(supabase, user.id, requestedMode(formData))
  if (!prepared.ok) return fail(prepared.message)
  const run = prepared.run
  const key = idempotencyKey(["coach-practice", user.id, setId, questionId, answer, PRACTICE_PROMPT_VERSION, run.mode, run.provider, run.model, requestNonce(formData)])
  const result = await coachAnswer({
    run,
    reservation: usageReservationDeps(supabase, { userId: user.id, secret: run.secret, idempotencyKey: key, mode: run.mode, provider: run.provider, model: run.model }),
    question,
    requirements: analysis?.requirements ?? [],
    answer,
    facts: facts.facts,
    persist: async (outcome, modelUsed) => {
      const inserted = await supabase.from("practice_answers").insert({
        set_id: set.id,
        question_id: question.id,
        answer,
        feedback: outcome.feedback,
        dropped: outcome.dropped,
        prompt_version: PRACTICE_PROMPT_VERSION,
        schema_version: COACH_SCHEMA_VERSION,
        provider: run.provider,
        model: modelUsed,
        execution_mode: run.mode,
      })
      if (inserted.error) saveFailed("Practice answer", inserted.error.code)
    },
  })
  if (!result.ok) return aiFailure(result.code, result.message)
  revalidatePath(`/interview/${set.id}`)
  return done("Coaching notes saved.")
}

/** Deletes one question set and its practice answers. Preparation items it created stay. */
export async function deleteQuestionSet(formData: FormData): Promise<RecordFormState> {
  if (!(await coachAllowed())) return fail(OFF)
  const user = await requireUser()
  const setId = String(formData.get("setId") ?? "")
  if (!isUuid(setId)) return fail("That question set could not be found.")
  const supabase = await createClient()
  const removed = await supabase.from("interview_question_sets").delete().eq("id", setId).eq("user_id", user.id).select("application_id")
  if (removed.error || !removed.data?.length) return fail("That question set could not be deleted.")
  const applicationId = removed.data[0]?.application_id
  if (applicationId) revalidatePath(`/applications/${applicationId}`)
  return done("Deleted.")
}
