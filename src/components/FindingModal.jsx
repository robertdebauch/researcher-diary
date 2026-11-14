function FindingModal({
  isOpen,
  note,
  setNote,
  onSave,
  onClose,
  isGoal,
  setIsGoal,
  image,
  onImageChange,
}) {
  if (!isOpen) {
    return null;
  }

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

        <textarea
          className="field"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Опишите находку…"
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
          <button className="btn btn--accent" onClick={onSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default FindingModal;
