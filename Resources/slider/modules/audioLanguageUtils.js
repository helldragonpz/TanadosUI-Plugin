const LANGUAGE_PRIORITY = [
  "bg",
  "en",
  "ru",
  "de",
  "fr",
  "es",
  "it",
  "tr",
  "ja",
  "ko"
];

const AUDIO_LANGUAGE_MAP = Object.freeze({
  bg: { flag: "🇧🇬", code: "BG", label: "Bulgarian" },
  en: { flag: "🇬🇧", code: "EN", label: "English" },
  ru: { flag: "🇷🇺", code: "RU", label: "Russian" },
  de: { flag: "🇩🇪", code: "DE", label: "German" },
  fr: { flag: "🇫🇷", code: "FR", label: "French" },
  es: { flag: "🇪🇸", code: "ES", label: "Spanish" },
  it: { flag: "🇮🇹", code: "IT", label: "Italian" },
  tr: { flag: "🇹🇷", code: "TR", label: "Turkish" },
  ja: { flag: "🇯🇵", code: "JA", label: "Japanese" },
  ko: { flag: "🇰🇷", code: "KO", label: "Korean" }
});

function text(value) {
  return String(value ?? "").trim();
}

export function normalizeAudioLanguageCode(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return "";

  const base = raw.split(/[-_]/)[0];
  if (base === "bg" || raw === "bul" || raw === "bulgarian") return "bg";
  if (base === "en" || raw === "eng" || raw === "english") return "en";
  if (base === "ru" || raw === "rus" || raw === "russian") return "ru";
  if (base === "de" || raw === "deu" || raw === "ger" || raw === "german") return "de";
  if (base === "fr" || raw === "fre" || raw === "fra" || raw === "french") return "fr";
  if (base === "es" || raw === "spa" || raw === "spanish") return "es";
  if (base === "it" || raw === "ita" || raw === "italian") return "it";
  if (base === "tr" || raw === "tur" || raw === "turkish") return "tr";
  if (base === "ja" || raw === "jpn" || raw === "japanese") return "ja";
  if (base === "ko" || raw === "kor" || raw === "korean") return "ko";

  if (base.length === 2) return base;
  if (raw.length === 3) return raw;
  return base || raw;
}

function getPriorityIndex(code) {
  const idx = LANGUAGE_PRIORITY.indexOf(code);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

export function getAudioLanguageDescriptor(code) {
  const normalized = normalizeAudioLanguageCode(code);
  if (!normalized) return null;

  const mapped = AUDIO_LANGUAGE_MAP[normalized];
  if (mapped) {
    return {
      normalizedCode: normalized,
      code: mapped.code,
      flag: mapped.flag,
      label: mapped.label,
      mapped: true
    };
  }

  return {
    normalizedCode: normalized,
    code: normalized.toUpperCase(),
    flag: "",
    label: normalized.toUpperCase(),
    mapped: false
  };
}

export function collectAudioLanguageDescriptors(mediaStreams, { maxCount = 2 } = {}) {
  const streams = Array.isArray(mediaStreams) ? mediaStreams : [];
  const deduped = new Map();
  let order = 0;

  for (const stream of streams) {
    if (!stream || String(stream.Type || "").toLowerCase() !== "audio") continue;
    const descriptor = getAudioLanguageDescriptor(
      stream.Language || stream.DisplayLanguage || stream.Title || ""
    );
    if (!descriptor) continue;

    const key = descriptor.normalizedCode || descriptor.code;
    if (!deduped.has(key)) {
      deduped.set(key, {
        ...descriptor,
        order,
        isDefault: stream.IsDefault === true
      });
      order += 1;
      continue;
    }

    const existing = deduped.get(key);
    if (existing && stream.IsDefault === true) {
      existing.isDefault = true;
    }
  }

  return [...deduped.values()]
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const priorityDiff = getPriorityIndex(a.normalizedCode) - getPriorityIndex(b.normalizedCode);
      if (priorityDiff !== 0) return priorityDiff;
      return a.order - b.order;
    })
    .slice(0, Math.max(1, maxCount | 0));
}

export function createAudioLanguageBadges(mediaStreams, options = {}) {
  return collectAudioLanguageDescriptors(mediaStreams, options).map((entry) => ({
    ...entry,
    text: entry.flag ? `${entry.flag} ${entry.code}` : entry.code
  }));
}
