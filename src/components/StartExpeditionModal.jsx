function StartExpeditionModal({
  isOpen,
  title,
  setTitle,
  goal,
  setGoal,
  onStart,
  onClose,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-title"
    >
      <div className="sheet__panel">
        <p className="section__label">Новая экспедиция</p>
        <h3 className="sheet__title" id="start-title">
          Куда идём?
        </h3>

        <label className="section__label" htmlFor="expedition-name">
          Название прогулки
        </label>
        <input
          id="expedition-name"
          className="field"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Например: лес у озера"
        />

        <label className="section__label" htmlFor="expedition-goal">
          Цель
        </label>
        <textarea
          id="expedition-goal"
          className="field"
          rows={3}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Что хотите найти?"
        />

        <div className="sheet__actions">
          <button className="btn btn--muted" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--accent" onClick={onStart}>
            В путь
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartExpeditionModal;
