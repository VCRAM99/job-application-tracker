/**
 * LOCAL ONLY. A stand-in for the OpenAI chat completions endpoint used by the
 * e2e server through OPENAI_BASE_URL. It answers each structured call by
 * schema name with deterministic output that the app's validators accept, so
 * no e2e run reaches a real provider. It binds 127.0.0.1 only.
 */
import { createServer } from "node:http"

import { mockStructuredResponse } from "../../src/lib/analyze/mock"
import { FAKE_OPENAI_PORT } from "./local-env"

type Body = {
  model?: string
  messages?: Array<{ role: string; content: string }>
  response_format?: { json_schema?: { name?: string } }
}

function tagged(user: string, tag: string): Record<string, unknown> {
  const start = user.indexOf(`<${tag}>`)
  const end = user.indexOf(`</${tag}>`)
  if (start < 0 || end < start) return {}
  try {
    return JSON.parse(user.slice(start + tag.length + 2, end).trim()) as Record<string, unknown>
  } catch {
    return {}
  }
}

type Fact = { id: string; type: string; text: string }

function firstSentence(text: string): string {
  const sentence = text.replace(/\s+/g, " ").trim().split(/(?<=\.)\s+/)[0] ?? ""
  return sentence.slice(0, 280)
}

export function answer(schema: string, user: string, system = ""): unknown {
  switch (schema) {
    case "job_requirement_extraction":
    case "job_requirement_matches":
      return JSON.parse(mockStructuredResponse({ schemaName: schema, user, system: "", apiKey: "", model: "", jsonSchema: {} }).text)
    case "interview_questions": {
      const input = tagged(user, "coach_input") as { requirements?: Array<{ id: string }> }
      const ids = (input.requirements ?? []).map((requirement) => requirement.id)
      return {
        questions: [
          { text: "How would you approach the main requirement of this role in practice?", kind: "technical", requirementIds: ids.slice(0, 1), rationale: "Checks practical depth.", factIds: [] },
          { text: "How do you decide between two designs when both have tradeoffs?", kind: "technical", requirementIds: ids.slice(1, 2), rationale: "Checks judgment.", factIds: [] },
          { text: "Tell me about a time you changed course after new information.", kind: "behavioral", requirementIds: ids.slice(0, 1), rationale: "Checks adaptability.", factIds: [] },
        ],
      }
    }
    case "story_bank": {
      const input = tagged(user, "coach_input") as { facts?: Fact[] }
      const fact = input.facts?.[0]
      if (!fact) return { stories: [] }
      return {
        stories: [
          {
            competency: "ownership",
            factIds: [fact.id],
            situation: "Add the situation you faced.",
            task: "Add what you were responsible for.",
            action: "Add the steps you took.",
            result: "Add the outcome you saw.",
          },
        ],
      }
    }
    case "practice_feedback":
      return {
        structure: "The answer moves from context to action in a clear order.",
        relevance: "It addresses the question directly.",
        specificity: "Add one concrete detail you actually handled.",
        improvement: "Close with the result in one sentence.",
        factIds: [],
      }
    case "research_brief": {
      const input = tagged(user, "coach_input") as { sources?: Array<{ id: string; text: string }> }
      return {
        claims: (input.sources ?? []).slice(0, 3).flatMap((source) => {
          const quote = firstSentence(source.text)
          return quote.length >= 12 ? [{ topic: "overview", text: quote, sourceId: source.id, quote }] : []
        }),
      }
    }
    case "coach_draft": {
      const answerOnly = system.includes("an answer to the application question")
      const sentences = answerOnly
        ? [
            { text: "This role matches the kind of work I want to do next.", factIds: [], claimIds: [], paragraphEnd: false },
            { text: "I would bring steady care to the work and clear communication with the team.", factIds: [], claimIds: [], paragraphEnd: true },
          ]
        : [
            { text: "Hello,", factIds: [], claimIds: [], paragraphEnd: true },
            { text: "I am interested in the open role and would welcome a short conversation.", factIds: [], claimIds: [], paragraphEnd: true },
            { text: "Thank you for your time.", factIds: [], claimIds: [], paragraphEnd: true },
          ]
      return { subject: "About the open role", sentences }
    }
    case "resume_sections": {
      const start = user.indexOf("<resume>")
      const end = user.indexOf("</resume>")
      const text = start >= 0 && end > start ? user.slice(start + 8, end) : ""
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 2)
      return {
        contact: { name: lines[0] ?? null, email: null, phone: null, location: null, links: [] },
        summary: null,
        experience: [],
        education: [],
        skills: [],
        projects: [],
        other: [{ heading: "Resume", lines: lines.slice(1, 12) }],
      }
    }
    case "resume_edits": {
      const input = tagged(user, "tailor_input") as { facts?: Fact[]; resume?: { skills?: string[] } }
      const have = new Set((input.resume?.skills ?? []).map((skill) => skill.toLowerCase()))
      const skill = (input.facts ?? []).find((fact) => fact.type === "skill" && !have.has(fact.text.split(" — ")[0]!.toLowerCase()))
      return {
        edits: skill
          ? [{ op: "add_skill", target: "skills", before: "", after: skill.text.split(" — ")[0], order: [], rationale: "Listed in your verified skills.", factIds: [skill.id] }]
          : [],
      }
    }
    case "career_extraction":
      return { employment: [], education: [], skills: [], projects: [], accomplishments: [], certifications: [] }
    default:
      throw new Error(`fake-openai: unknown schema ${schema}`)
  }
}

if (require.main === module) {
  createServer((request, response) => {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "text/plain" }).end("fake-openai ok")
      return
    }
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body
        const schema = body.response_format?.json_schema?.name ?? ""
        const user = body.messages?.find((message) => message.role === "user")?.content ?? ""
        const system = body.messages?.find((message) => message.role === "system")?.content ?? ""
        const content = JSON.stringify(answer(schema, user, system))
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            id: "chatcmpl-e2e",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: body.model ?? "fake",
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
        )
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: (error as Error).message } }))
      }
    })
  }).listen(FAKE_OPENAI_PORT, "127.0.0.1", () => console.log(`fake-openai listening on ${FAKE_OPENAI_PORT}`))
}
