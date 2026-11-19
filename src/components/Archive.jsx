import { formatFindingsCount } from "../utils";

function Archive({
  expeditions,
  allFindings,
  onSelect,
  onStart,
  onHardReset,
  onOpenSummary,
  onExport,
  onImport,
  onOpenSettings,
}) {
  const formatStartTime = (value) =>
    new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="list-view">
      <header>
        <h1 className="list-view__title">RESEARCHER</h1>
        <p className="list-view__subtitle label">Дневник исследователя</p>
      </header>

      <button className="action-primary" onClick={onStart}>
        <span>Новая экспедиция</span>
        <span aria-hidden="true">+</span>
      </button>

      <section className="section">
        <p className="section__label">Экспедиции · {expeditions.length}</p>

        {expeditions.length === 0 ? (
          <p className="empty-state">
            Пока ни одной прогулки. Начните с первой.
          </p>
        ) : (
          expeditions.map((expedition) => {
            const expeditionFindings = allFindings.filter(
              (finding) => finding.expeditionId === expedition.id,
            );
            const goalFinding = expeditionFindings.find(
              (finding) => finding.isGoal && finding.image,
            );
            const anyFinding = expeditionFindings.find(
              (finding) => finding.image,
            );
            const previewImage = goalFinding?.image || anyFinding?.image;

            return (
              <div className="row" key={expedition.id}>
                <button
                  className="row__main"
                  onClick={() => onSelect(expedition)}
                >
                  {previewImage ? (
                    <img className="row__thumb" src={previewImage} alt="" />
                  ) : (
                    <span className="row__thumb row__thumb--empty">—</span>
                  )}

                  <span className="row__body">
                    <span className="row__title">{expedition.title}</span>
                    <span className="row__goal">«{expedition.goal}»</span>
                    <span className="row__meta">
                      {formatStartTime(expedition.startTime)}
                    </span>
                  </span>
                </button>

                <div className="row__aside">
                  <span
                    className={`row__count ${expeditionFindings.length > 0 ? "" : "row__count--empty"}`}
                  >
                    {formatFindingsCount(expeditionFindings.length)}
                  </span>
                  <button
                    className="btn btn--muted"
                    onClick={() => onOpenSummary(expedition.id)}
                  >
                    отчёт
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="section">
        <p className="section__label">Данные</p>

        <div className="actions-row">
          <button className="btn" onClick={onExport}>
            Экспорт JSON
          </button>

          <label className="btn">
            Импорт JSON
            <input
              type="file"
              accept=".json"
              onChange={onImport}
              className="visually-hidden"
            />
          </label>

          <button className="btn" onClick={onOpenSettings}>
            Распознавание
          </button>
        </div>

        {expeditions.length > 0 && (
          <button className="btn btn--muted" onClick={onHardReset}>
            Полный сброс данных
          </button>
        )}
      </section>
    </div>
  );
}

export default Archive;
