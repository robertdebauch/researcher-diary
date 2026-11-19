import { useEffect, useState } from "react";
import {
  DAILY_LIMIT,
  checkAvailability,
  describeAvailability,
  getApiKey,
  getConsent,
  getUsage,
  saveApiKey,
  saveConsent,
} from "../recognition";

function SettingsSheet({ isOpen, onClose }) {
  const [draftKey, setDraftKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState({ date: "", count: 0 });
  const [availability, setAvailability] = useState(null);
  const [status, setStatus] = useState("idle");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    async function loadSettings() {
      const [storedKey, storedConsent, storedUsage] = await Promise.all([
        getApiKey(),
        getConsent(),
        getUsage(),
      ]);

      if (isCancelled) {
        return;
      }

      setDraftKey(storedKey);
      setSavedKey(storedKey);
      setConsent(storedConsent);
      setUsage(storedUsage);
      setAvailability(null);
      setStatus("idle");
      setSavedFlash(false);
    }

    loadSettings();

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const isBusy = status === "checking";
  const isDirty = draftKey.trim() !== savedKey;
  const isRegionBlocked = availability?.status === "region";
  const isKeyBroken = availability?.status === "key";

  const handleSaveKey = async () => {
    const nextKey = draftKey.trim();
    await saveApiKey(nextKey);
    setSavedKey(nextKey);
    setDraftKey(nextKey);
    setAvailability(null);
    setSavedFlash(true);
  };

  const handleCheck = async () => {
    setStatus("checking");
    const result = await checkAvailability(draftKey.trim(), { force: true });
    setAvailability(result);
    setStatus("idle");
  };

  const handleForgetKey = async () => {
    await saveApiKey("");
    setDraftKey("");
    setSavedKey("");
    setAvailability(null);
    setConsent(false);
    await saveConsent(false);
  };

  const handleConsentChange = async (event) => {
    const nextConsent = event.target.checked;
    setConsent(nextConsent);
    await saveConsent(nextConsent);
  };

  return (
    <div
      className="sheet sheet--top"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="sheet__panel">
        <p className="section__label">Настройки</p>
        <h3 className="sheet__title" id="settings-title">
          Распознавание
        </h3>

        <p className="recognition__hint">
          Ключ хранится только на этом устройстве, в IndexedDB. В сборку и
          репозиторий он не попадает.
        </p>

        <label className="field-label section__label" htmlFor="gemini-key">
          Ключ Gemini API
        </label>
        <input
          id="gemini-key"
          className="field"
          type="password"
          value={draftKey}
          onChange={(event) => {
            setDraftKey(event.target.value);
            setSavedFlash(false);
          }}
          placeholder="AIza…"
          autoComplete="off"
          spellCheck="false"
        />

        <div className="recognition__actions">
          <button
            className="btn btn--accent"
            onClick={handleSaveKey}
            disabled={!isDirty}
          >
            Сохранить ключ
          </button>
          <button
            className="btn btn--muted"
            onClick={handleCheck}
            disabled={isBusy || !draftKey.trim()}
          >
            {isBusy ? "Проверяю…" : "Проверить подключение"}
          </button>
        </div>

        {savedFlash && <p className="recognition__status">Ключ сохранён</p>}

        {availability && (
          <p
            className={`recognition__status ${
              isRegionBlocked || isKeyBroken
                ? "recognition__error"
                : ""
            }`}
            role="status"
          >
            {describeAvailability(availability)}
            {availability.status === "ok" &&
              ` · ${availability.models.length} моделей`}
          </p>
        )}

        <label className="check">
          <input
            type="checkbox"
            className="check__input"
            checked={consent}
            onChange={handleConsentChange}
          />
          <span>Разрешить отправку фото в Google</span>
        </label>

        <div className="recognition__row">
          <span className="section__label">Квота</span>
          <span className="recognition__meta">
            {usage.count} из {DAILY_LIMIT} сегодня
          </span>
        </div>
        <p className="recognition__hint">
          Бесплатный лимит Gemini — {DAILY_LIMIT} запросов в сутки, сброс
          в полночь по Тихоокеанскому времени. Одинаковые фото берутся из кэша
          и не тратят квоту.
        </p>

        {savedKey && (
          <button className="btn btn--muted" onClick={handleForgetKey}>
            Забыть ключ
          </button>
        )}

        <div className="sheet__actions">
          <button className="btn btn--accent" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsSheet;
