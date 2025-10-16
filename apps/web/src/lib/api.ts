// ---- phone numbers ----

export type SearchNumbersParams = {
  country: string;       // required (e.g. "US")
  areaCode?: string;     // e.g. "949"
  contains?: string;     // e.g. "555"
  sms?: boolean;         // default true in UI
  mms?: boolean;         // default false
  voice?: boolean;       // default false
  limit?: number;        // e.g. 20
};

// GET /api/numbers/available
export async function searchNumbers(params: SearchNumbersParams) {
  const p = new URLSearchParams();
  p.set("country", params.country);
  if (params.areaCode) p.set("areaCode", params.areaCode);
  if (params.contains) p.set("contains", params.contains);
  if (params.sms) p.set("sms", "true");
  if (params.mms) p.set("mms", "true");
  if (params.voice) p.set("voice", "true");
  if (typeof params.limit === "number") p.set("limit", String(params.limit));

  return http<{ ok: boolean; data?: any[]; error?: string }>(
    `/api/numbers/available?${p.toString()}`
  );
}

// POST /api/numbers/purchase
export async function purchaseNumber(input: {
  country: string;
  phoneNumber: string;
  makeDefault?: boolean;
  messagingServiceSid?: string;
}) {
  return http<{ ok: boolean; number?: any; error?: string }>(
    "/api/numbers/purchase",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}