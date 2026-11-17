import { db, getSetting, setSetting } from "./db";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 45000;
const PREFLIGHT_TIMEOUT_MS = 12000;
const AVAILABILITY_TTL_MS = 10 * 60 * 1000;
const RECOGNITION_IMAGE_SIZE = 768;

export const DAILY_LIMIT = 100;

const PROMPT = `Ты помогаешь исследователю на прогулке опознать объект на фото.
Ответь строго JSON:
{"label": "краткое название объекта по-русски", "confidence": 0-100, "description": "1-2 предложения по-русски: что это и по каким признакам видно"}
Если объект не опознан, поставь label "не определено" и низкий confidence.`;

const MODEL_PREFERENCE = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

let availabilityCache = null;

/** Дата по тихоокеанскому времени: квота Gemini сбрасывается в полночь PT. */
export function getPacificDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(date);
}

export async function getApiKey() {
  return (await getSetting("geminiApiKey")) || "";
}

export async function saveApiKey(value) {
  await setSetting("geminiApiKey", value.trim());
  // Ключ сменили — старый вердикт проверки (например, «ключ не подошёл») больше не верен.
  availabilityCache = null;
}

export async function getConsent() {
  return Boolean(await getSetting("recognitionConsent"));
}

export async function saveConsent(value) {
  await setSetting("recognitionConsent", Boolean(value));
}

export async function getUsage() {
  const stored = await getSetting("recognitionUsage");
  const today = getPacificDateKey();

  if (!stored || stored.date !== today) {
    return { date: today, count: 0 };
  }

  return stored;
}

export async function incrementUsage() {
  const usage = await getUsage();
  const next = { date: usage.date, count: usage.count + 1 };
  await setSetting("recognitionUsage", next);
  return next;
}

/**
 * Лёгкая проверка ключа и региона: запрос списка моделей, без изображения.
 * Именно здесь мы узнаём про русский IP и не отправляем фото впустую.
 */
export async function checkAvailability(apiKey, { force = false } = {}) {
  if (!apiKey) {
    return { status: "no-key", models: [] };
  }

  if (
    !force &&
    availabilityCache &&
    Date.now() - availabilityCache.checkedAt < AVAILABILITY_TTL_MS
  ) {
    return availabilityCache;
  }

  try {
    const response = await fetch(
      `${API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS) },
    );
    const body = await response.text();

    if (response.ok) {
      const data = JSON.parse(body);
      const models = (data.models ?? [])
        .filter((model) =>
          (model.supportedGenerationMethods ?? []).includes("generateContent"),
        )
        .map((model) => model.name.replace(/^models\//, ""));

      availabilityCache = { checkedAt: Date.now(), status: "ok", models };
      return availabilityCache;
    }

    if (body.includes("User location is not supported")) {
      availabilityCache = { checkedAt: Date.now(), status: "region", models: [] };
      return availabilityCache;
    }

    if (response.status === 401 || response.status === 403 || body.includes("API key not valid")) {
      availabilityCache = { checkedAt: Date.now(), status: "key", models: [] };
      return availabilityCache;
    }

    return {
      checkedAt: Date.now(),
      status: "error",
      models: [],
      message: body.slice(0, 200),
    };
  } catch (error) {
    return {
      checkedAt: Date.now(),
      status: "network",
      models: [],
      message: error.message,
    };
  }
}

export function pickModels(available) {
  const preferred = MODEL_PREFERENCE.filter((model) => available.includes(model));
  const fallback = available.filter(
    (model) => model.includes("flash") && !preferred.includes(model),
  );

  return [...preferred, ...fallback];
}

/** Человеческое объяснение состояния проверки — для UI. */
export function describeAvailability(availability) {
  switch (availability.status) {
    case "no-key":
      return "Ключ не добавлен";
    case "ok":
      return "Готово";
    case "region":
      return "Нужен VPN: Gemini недоступен из вашей сети";
    case "key":
      return "Ключ не подошёл";
    case "network":
      return "Нет связи с Gemini (сеть или VPN)";
    default:
      return "Не удалось проверить";
  }
}

/** Уменьшает фото перед отправкой в API: 768 px заметно экономит токены. */
export async function prepareImage(dataUrl, maxSize = RECOGNITION_IMAGE_SIZE) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      let width = image.width;
      let height = image.height;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => reject(new Error("Не удалось подготовить изображение"));
    image.src = dataUrl;
  });
}

/** Кэш по хешу фото: повторное фото не тратит квоту. */
export async function hashDataUrl(dataUrl) {
  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stripFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function buildRequestBody(dataUrl) {
  const base64 = dataUrl.split(",")[1] ?? "";

  return {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

async function callModel(model, apiKey, dataUrl) {
  const response = await fetch(
    `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify(buildRequestBody(dataUrl)),
    },
  );

  const body = await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }

  const data = JSON.parse(body);
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") ?? "";

  const parsed = JSON.parse(stripFences(text));

  return {
    ok: true,
    status: 200,
    label: String(parsed.label ?? "не определено"),
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    description: String(parsed.description ?? ""),
    model,
  };
}


/**
 * Распознавание фото. Сначала проверяем регион и ключ (без отправки картинки),
 * затем отдаём фото модели с фолбэком по списку.
 */
export async function recognizeImage({ apiKey, imageDataUrl }) {
  const prepared = await prepareImage(imageDataUrl);
  const hash = await hashDataUrl(prepared);

  const cached = await db.recognitionCache.get(hash);

  if (cached) {
    return { ok: true, fromCache: true, ...cached };
  }

  const availability = await checkAvailability(apiKey);

  if (availability.status === "region") {
    return { ok: false, reason: "region" };
  }

  if (availability.status === "key") {
    return { ok: false, reason: "key" };
  }

  if (availability.status === "no-key") {
    return { ok: false, reason: "no-key" };
  }

  if (availability.status === "network") {
    return { ok: false, reason: "network", message: availability.message };
  }

  const usage = await getUsage();

  if (usage.count >= DAILY_LIMIT) {
    return { ok: false, reason: "quota", usage };
  }

  let lastError = null;

  for (const model of pickModels(availability.models).slice(0, 4)) {
    try {
      const attempt = await callModel(model, apiKey, prepared);

      if (!attempt.ok) {
        lastError = attempt;

        if (attempt.status === 429) {
          return { ok: false, reason: "quota" };
        }

        if (attempt.body.includes("User location is not supported")) {
          return { ok: false, reason: "region" };
        }

        continue;
      }

      const result = {
        label: attempt.label,
        confidence: attempt.confidence,
        description: attempt.description,
        model: attempt.model,
      };

      await db.recognitionCache.put({ hash, ...result, createdAt: Date.now() });
      const nextUsage = await incrementUsage();

      return { ok: true, fromCache: false, usage: nextUsage, ...result };
    } catch (error) {
      lastError = { status: 0, body: error.message };
    }
  }

  return {
    ok: false,
    reason: "error",
    message: String(lastError?.body ?? "Модель не ответила").slice(0, 200),
  };
}

