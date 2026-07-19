import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/user";
import {
  DEFAULT_GENRE_TAXONOMY,
  parseGenreSuggestion,
} from "@/lib/openai/genre-classification";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MODEL = "gpt-audio";
const SUPPORTED_FORMATS = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/wave", "wav"],
  ["audio/x-wav", "wav"],
]);

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status,
  });
}

export async function POST(request: Request) {
  const user = await getOptionalUser();
  if (!user) return response({ error: "Sesión no válida." }, 401);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return response(
      { error: "La clasificación opcional no está configurada." },
      503,
    );
  }

  const supabase = await createClient();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await supabase
    .from("ai_analysis_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("analysis_kind", "genre")
    .gte("created_at", windowStart);
  if (rateLimitError) {
    console.error("OpenAI genre rate limit lookup failed", rateLimitError.code);
    return response(
      { error: "No se pudo verificar el límite de clasificación." },
      503,
    );
  }
  if ((count ?? 0) >= 20) {
    return response(
      { error: "Has alcanzado el límite de 20 análisis por hora." },
      429,
    );
  }

  const formData = await request.formData();
  if (formData.get("consent") !== "true") {
    return response(
      { error: "Debes autorizar expresamente el envío del fragmento." },
      400,
    );
  }
  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return response({ error: "Falta el fragmento de audio." }, 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return response(
      { error: "El fragmento supera el límite de 12 MB." },
      413,
    );
  }
  const format = SUPPORTED_FORMATS.get(audio.type);
  if (!format) {
    return response({ error: "El formato de audio no es compatible." }, 415);
  }

  const taxonomy = [...DEFAULT_GENRE_TAXONOMY];
  const encoded = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const { error: usageError } = await supabase
    .from("ai_analysis_events")
    .insert({
      analysis_kind: "genre",
      user_id: user.id,
    });
  if (usageError) {
    console.error("OpenAI genre usage recording failed", usageError.code);
    return response(
      { error: "No se pudo registrar el consentimiento del análisis." },
      503,
    );
  }
  let openAiResponse: Response;
  try {
    openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      body: JSON.stringify({
        max_completion_tokens: 300,
        messages: [
          {
            content: [
              {
                text:
                  `Clasifica el género musical usando exactamente una opción de esta taxonomía: ${taxonomy.join(", ")}. ` +
                  'Responde solo JSON válido con {"genre":string,"confidence":number,"explanation":string}. ' +
                  "La confianza debe estar entre 0 y 1 y la explicación debe ser breve. No inventes etiquetas.",
                type: "text",
              },
              {
                input_audio: { data: encoded, format },
                type: "input_audio",
              },
            ],
            role: "user",
          },
        ],
        model: MODEL,
        store: false,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    console.error(
      "OpenAI genre classification request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return response(
      { error: "La clasificación no respondió a tiempo. Vuelve a intentarlo." },
      504,
    );
  }

  if (!openAiResponse.ok) {
    console.error("OpenAI genre classification failed", openAiResponse.status);
    return response(
      { error: "No se pudo completar la clasificación opcional." },
      502,
    );
  }
  const payload = (await openAiResponse.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return response({ error: "El clasificador no devolvió una sugerencia." }, 502);
  }

  try {
    return response({
      suggestion: parseGenreSuggestion(content, taxonomy, MODEL),
    });
  } catch {
    return response(
      { error: "La sugerencia requiere revisión y se ha descartado." },
      502,
    );
  }
}
