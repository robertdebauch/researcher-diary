import { useEffect, useState } from "react";
import {
  DAILY_LIMIT,
  checkAvailability,
  describeAvailability,
  getApiKey,
  getConsent,
  getUsage,
  recognizeImage,
  saveConsent,
} from "../recognition";

function FindingModal({
  isOpen,
  name,
  setName,
  description,
  setDescription,
  onSave,
  onClose,
  isGoal,
  setIsGoal,
  image,
  onImageChange,
  onOpenSettings,
  settingsRevision,
}) {
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState({ date: "", count: 0 });
  const [availability, setAvailability] = useState(null);
  const [hasConsentCheck, setHasConsentCheck] = useState(false);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Ключ, согласие и счётчик живут в IndexedDB — читаем при каждом открытии листа.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    async function loadRecognitionState() {
      const [storedKey, storedConsent, storedUsage] = await Promise.all([
        getApiKey(),
        getConsent(),
        getUsage(),
      ]);

      if (isCancelled) {
        return;
      }

      setApiKey(storedKey);
      setConsent(storedConsent);
      setUsage(storedUsage);
      setAvailability(null);
      setStatus("idle");
      setResult(null);
      setError("");
    }

    loadRecognitionState();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, settingsRevision]);

  // Проверка региона до отправки фото: лёгкий запрос списка моделей.
  useEffect(() => {
    if (!isOpen || !image || !apiKey) {
      return;
    }

    let isCancelled = false;

    checkAvailability(apiKey)
      .then((nextAvailability) => {
        if (!isCancelled) {
          setAvailability(nextAvailability);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [isOpen, image, apiKey]);

  if (!isOpen) {
    return null;
  }

  const isRegionBlocked = availability?.status === "region";
  const isKeyBroken =
    availability?.status === "key" || availability?.status === "no-key";
  const needsConsent = Boolean(apiKey) && !consent;
  const isBusy = status === "loading";
  const isOverwrite = Boolean(name.trim() || description.trim());

  const handleRecognize = async () => {
    if (!apiKey) {
      onOpenSettings();
      return;
    }

    if (needsConsent) {
      if (!hasConsentCheck) {
        return;
      }

      await saveConsent(true);
      setConsent(true);
    }

    setStatus("loading");
    setError("");
    setResult(null);

    try {
      const outcome = await recognizeImage({ apiKey, imageDataUrl: image });

      if (outcome.ok) {
        setResult(outcome);

        if (outcome.usage) {
          setUsage(outcome.usage);
        }
      } else {
        const messages = {
          region: "Нужен VPN: Gemini недоступен из вашей сети. Фото не отправлено.",
          key: "Ключ не подошёл — проверьте его в настройках.",
          "no-key": "Добавьте ключ Gemini в настройках.",
          quota: `Дневной лимит ${DAILY_LIMIT} распознаваний исчерпан. Сброс в полночь по Тихоокеанскому времени.`,
          network: "Нет связи с Gemini. Проверьте сеть или VPN.",
        };

        setError(
          outcome.reason === "error" && outcome.message
            ? `Не удалось распознать: ${outcome.message}`
            : messages[outcome.reason] ?? "Не удалось распознать фото.",
        );
      }
    } catch (recognizeError) {
      setError(`Не удалось распознать: ${recognizeError.message}`);
    } finally {
      setStatus("idle");
    }
  };

  const applyResult = () => {
    setName(result.label);
    setDescription(result.description);
  };

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finding-title"
    >
      <div className="sheet__panel">
        <p className="section__label">Находка</p>
        <h3 className="sheet__title" id="finding-title">
          Что вы нашли?
        </h3>

        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Название — что это?"
        />

        <textarea
          className="field"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Детали, признаки, мысли…"
        />

        <label className="btn btn--muted">
          {image ? "Фото выбрано · заменить" : "Сфотографировать или выбрать фото"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onImageChange}
            className="visually-hidden"
          />
        </label>

        {image && (
          <img className="finding__image" src={image} alt="Превью находки" />
        )}

        {image && (
          <section className="recognition" aria-busy={isBusy}>
            <div className="recognition__row">
              <span className="section__label">Распознавание</span>
              <span className="recognition__meta">
                {apiKey
                  ? `${usage.count} из ${DAILY_LIMIT} сегодня`
                  : "ключ не добавлен"}
              </span>
            </div>

            {!apiKey && (
              <p className="recognition__hint">
                Чтобы распознавать фото, добавьте ключ Gemini. Фото уходит
                в Google только по кнопке.
              </p>
            )}

            {apiKey && (isRegionBlocked || isKeyBroken) && (
              <p className="recognition__hint recognition__hint--warn">
                {describeAvailability(availability)}
              </p>
            )}

            {needsConsent && (
              <label className="check">
                <input
                  type="checkbox"
                  className="check__input"
                  checked={hasConsentCheck}
                  onChange={(event) =>
                    setHasConsentCheck(event.target.checked)
                  }
                />
                <span>Отправлять фото в Google Gemini</span>
              </label>
            )}

            <div className="recognition__actions">
              <button
                className="btn btn--accent"
                onClick={handleRecognize}
                disabled={
                  isBusy ||
                  isRegionBlocked ||
                  isKeyBroken ||
                  (needsConsent && !hasConsentCheck)
                }
              >
                {isBusy ? "Распознаю…" : apiKey ? "Распознать" : "Настроить"}
              </button>
              {isBusy && (
                <span className="recognition__status">до 15 секунд</span>
              )}
            </div>

            {error && (
              <p className="recognition__error" role="status">
                {error}
              </p>
            )}

            {result && (
              <div className="recognition__result">
                <div className="recognition__row">
                  <span className="recognition__label">{result.label}</span>
                  <span className="recognition__meta">
                    {result.fromCache ? "из кэша" : `${result.confidence} %`}
                  </span>
                </div>

                {result.description && (
                  <p className="note">{result.description}</p>
                )}

                <div className="recognition__row">
                  <button className="btn btn--accent" onClick={applyResult}>
                    {isOverwrite ? "Заменить поля" : "Заполнить поля"}
                  </button>
                  <span className="recognition__meta">
                    {result.model ?? "gemini"}
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        <label className="check">
          <input
            type="checkbox"
            className="check__input"
            checked={isGoal || false}
            onChange={(event) => setIsGoal(event.target.checked)}
          />
          <span>Это была моя цель</span>
        </label>

        <div className="sheet__actions">
          <button className="btn btn--muted" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--accent" onClick={onSave} disabled={isBusy}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default FindingModal;

