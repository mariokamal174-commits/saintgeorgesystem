import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface ExtractInput {
  imageBase64: string;
  mimeType: string;
  isFirst: boolean;
}

export const extractReceiptData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): ExtractInput => {
    const i = input as ExtractInput;
    if (!i?.imageBase64 || !i?.mimeType) throw new Error("Missing image");
    return { imageBase64: i.imageBase64, mimeType: i.mimeType, isFirst: !!i.isFirst };
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const schemaFirst = `{
  "receipt_number": "رقم الإيصال كنص",
  "activity_fees": "رسوم النشاط كرقم",
  "education_fees": "رسوم التعليم كرقم",
  "receipt_date": "تاريخ الإيصال YYYY-MM-DD إن وُجد وإلا null"
}`;
    const schemaOther = `{
  "receipt_number": "رقم الإيصال كنص",
  "amount": "المبلغ كرقم",
  "receipt_date": "تاريخ الإيصال YYYY-MM-DD"
}`;

    const prompt = data.isFirst
      ? `استخرج بيانات هذا الإيصال (أول قسط) وأعدها بصيغة JSON فقط بدون أي شرح. الحقول المطلوبة: ${schemaFirst}`
      : `استخرج بيانات هذا الإيصال (قسط) وأعدها بصيغة JSON فقط بدون أي شرح. الحقول المطلوبة: ${schemaOther}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    try {
      return JSON.parse(content) as Record<string, string | number | null>;
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      return (m ? JSON.parse(m[0]) : {}) as Record<string, string | number | null>;
    }
  });
