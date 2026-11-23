import Anthropic from "@anthropic-ai/sdk";

const PROMPT=(caseText,focus,mode,hasImg)=>`너는 LG AIDV(AI-Defined Vehicle) 산학 프로젝트의 사례 분석가다. 아래 사례를 From–Trend–Future 형식으로 분석해 JSON 하나만 출력한다.

[사례]
${caseText}
${focus?`\n[분석 초점]\n${focus}\n`:""}${hasImg?"\n첨부 이미지도 사례 자료로 함께 읽는다.\n":""}
[규칙]
- Trend = 입력된 사례 자체. ${mode==="sota"?"From = Trend 직전의 가장 앞선 양산·상용 수준(SOTA). 원시적인 수동 조작 같은 먼 과거로 내려가지 않는다.":"From = 같은 일을 사람이 직접 하던 방식."}
- Future = Trend가 추구하는 본질을 밀어붙인 방향. 강화는 같은 도메인 안에서 Trend의 변화를 극한까지 밀었을 때, 확장은 같은 본질을 다른 도메인·맥락·대상으로 옮겼을 때. 솔루션이 아니라 기회의 방향으로 쓴다.
- 키워드(from/trend/future)는 2~6자 명사구 세 개가 하나의 축 위에서 단계적으로 변해야 한다. 예: 도메인 분절 → 도메인 통합 → 도메인 확장 / 명령 후 실행형 → 선제 제안형 → 즉시 실행형 / 직접 수행 → 자동 수행 → 예방적 개입.
- H(How, 무엇이 어떻게 작동하나)는 반드시 "~하여"로, E(Effect, 그래서 무엇이 일어나나)도 반드시 "~하여"로, V(Value, 사용자가 무엇으로 인식·체감하나)는 반드시 "~한다"로 끝난다. H·E·V를 이어 읽으면 "~하여 ~하여 ~한다"의 한 문장이 되어야 한다. "~하며", "~해", "~되어"로 끝내지 않는다. From과 Trend의 같은 행은 같은 대상을 두고 대구가 되게. 바뀐 핵심어 1~2개만 **굵게**.
- 번호 매기기, 잘게 쪼개기 금지. 큰 개념으로 한 문장씩.
- headline: 2~3줄(줄바꿈 \\n), 명사로 끝나는 무게 있는 제목. 예: "주행 중 실시간 데이터 환류로\\n플릿 전체의 판단력을 자기강화하는\\n차량 AI 학습 오케스트레이션"
- description: 사례 설명 3~4문장, 사실만. 모르는 수치·연도는 지어내지 않는다.
- 엠대시(—) 금지. 보고서체. 과장된 마케팅 어휘 금지.

[출력 JSON]
{"case":{"title":"짧은 사례명","source":"브랜드·기관(모르면 빈 문자열)","headline":"","description":""},
"keywords":{"from":"","trend":"","future":""},
"hev":{"from":{"h":"","e":"","v":""},"trend":{"h":"","e":"","v":""}},
"future":{"reinforce":{"keyword":"","text":"2~3문장"},"expand":{"keyword":"","text":"2~3문장"}}}`;

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!process.env.ANTHROPIC_BASE_URL && !process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: "AI 기능이 아직 켜지지 않았어요." }, { status: 503 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }
  const caseText = String(body.caseText || "").trim().slice(0, 12000);
  if (!caseText) return Response.json({ error: "사례를 입력해 주세요." }, { status: 400 });
  const focus = String(body.focus || "").slice(0, 300);
  const mode = body.mode === "human" ? "human" : "sota";
  const content = [];
  const img = body.image;
  if (img && typeof img.data === "string" && /^image\/(png|jpeg|webp|gif)$/.test(img.type) && img.data.length < 6_000_000)
    content.push({ type: "image", source: { type: "base64", media_type: img.type, data: img.data } });
  content.push({ type: "text", text: PROMPT(caseText, focus, mode, content.length > 0) });

  const anthropic = new Anthropic();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = anthropic.messages.stream({ model: "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content }] });
        s.on("text", (t) => controller.enqueue(enc.encode(t)));
        await s.finalMessage();
      } catch (e) {
        controller.enqueue(enc.encode("\n[[ERROR]]" + (e?.status || "") + " " + (e?.message || e)));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
};

export const config = {
  path: "/api/ftf",
  method: "POST",
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
