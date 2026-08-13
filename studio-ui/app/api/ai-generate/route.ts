import { NextRequest, NextResponse } from "next/server";
import { getAiAdapter, CAROUSEL_ROOT } from "@/lib/adapters";
import { sampleStyleExamples } from "@/lib/style-examples";
import { resolveAssetsForSlides } from "@/lib/ai-arranger";
import type { Message } from "@sitehie/core/ports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai-generate?samples=true  — return style examples */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("samples") === "true") {
    try {
      const examples = await sampleStyleExamples(CAROUSEL_ROOT);
      return NextResponse.json({ examples });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "use ?samples=true" }, { status: 400 });
}

/** DELETE /api/ai-generate?sessionID=xxx  — clean up an OpenCode session */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionID = searchParams.get("sessionID");
  if (!sessionID) {
    return NextResponse.json({ error: "sessionID query param required" }, { status: 400 });
  }
  await getAiAdapter("opencode").destroySession?.(sessionID)?.catch(() => {});
  return NextResponse.json({ ok: true });
}

/** POST /api/ai-generate — chat, generate, or cleanup actions */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, history, targetCount, themeName, modelName, provider, sessionID } = body;

    if (!action) {
      return NextResponse.json({ error: "action is required: 'chat' or 'generate'" }, { status: 400 });
    }

    const styleExamples = await sampleStyleExamples(CAROUSEL_ROOT);

    if (action === "chat") {
      if (!Array.isArray(history)) {
        return NextResponse.json({ error: "history array is required" }, { status: 400 });
      }
      const messages: Message[] = history.map((m: { role: string; content: string }) => ({
        role: m.role as Message["role"],
        content: m.content,
      }));
      const result = await getAiAdapter(provider).chatTurn({
        history: messages,
        styleExamples,
        modelName,
        sessionID,
      });
      return NextResponse.json({ reply: result.reply, sessionID: result.sessionID });
    }

    if (action === "generate") {
      if (!Array.isArray(history) || history.length === 0) {
        return NextResponse.json({ error: "history array is required" }, { status: 400 });
      }
      if (typeof targetCount !== "number" || targetCount < 1 || targetCount > 30) {
        return NextResponse.json({ error: "targetCount must be 1-30" }, { status: 400 });
      }
      const resolvedThemeName = themeName || "default";
      const messages: Message[] = history.map((m: { role: string; content: string }) => ({
        role: m.role as Message["role"],
        content: m.content,
      }));
      const result = await getAiAdapter(provider).generateFromChat({
        history: messages,
        targetCount,
        themeName: resolvedThemeName,
        themeColors: {},
        styleExamples,
        modelName,
      });

      // Same theme-icon enrichment as the arrange path.
      result.slides = await resolveAssetsForSlides(result.slides, resolvedThemeName, CAROUSEL_ROOT);

      return NextResponse.json(result);
    }

    if (action === "cleanup" && sessionID) {
      await getAiAdapter("opencode").destroySession?.(sessionID)?.catch(() => {});
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}