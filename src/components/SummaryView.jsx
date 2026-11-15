import {
  calculateRouteStats,
  findingsNoun,
  formatFindingsCount,
} from "../utils";

function SummaryView({ expedition, findings, onBack }) {
  // Отчёт могли открыть для экспедиции, которой уже нет в state — не роняем приложение.
  if (!expedition) {
    return (
      <div className="list-view">
        <button className="btn btn--muted" onClick={onBack}>
          ← Архив
        </button>
        <p className="empty-state">Экспедиция не найдена</p>
      </div>
    );
  }

  const calculateDuration = () => {
    if (!expedition.startTime || !expedition.endTime) {
      return "не завершена";
    }

    const difference =
      new Date(expedition.endTime) - new Date(expedition.startTime);
    const totalMinutes = Math.floor(difference / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours} ч ${minutes} мин` : `${totalMinutes} мин`;
  };

  const isGoalReached = findings.some((finding) => finding.isGoal);

  const { distanceMeters, distanceKm, movingMs } = calculateRouteStats(
    expedition.path,
  );

  // Скорость — по времени в движении, а не по общему времени прогулки.
  const averageSpeed =
    movingMs > 0
      ? (distanceMeters / 1000 / (movingMs / 3600000)).toFixed(1)
      : "0.0";

  return (
    <div className="list-view">
      <button className="btn btn--muted" onClick={onBack}>
        ← Архив
      </button>

      <header>
        <h1 className="list-view__title">{expedition.title}</h1>
        <p className="note">«{expedition.goal}»</p>
        <p className="label">
          {new Date(expedition.startTime).toLocaleDateString("ru-RU")} ·{" "}
          {calculateDuration()}
        </p>
      </header>

      <section className="stats">
        <div className="stats__cell">
          <div className="stats__value">{findings.length}</div>
          <div className="stats__label">{findingsNoun(findings.length)}</div>
        </div>

        <div className="stats__cell">
          <div className="stats__value">{distanceKm}</div>
          <div className="stats__label">Км пути</div>
        </div>

        <div className="stats__cell">
          <div className="stats__value">{averageSpeed}</div>
          <div className="stats__label">Км/ч в движении</div>
        </div>

        <div className="stats__cell">
          <div
            className={`stats__value ${isGoalReached ? "stats__value--accent" : ""}`}
          >
            {isGoalReached ? "да" : "нет"}
          </div>
          <div className="stats__label">Цель</div>
        </div>
      </section>

      <section className="section">
        <p className="section__label">
          {formatFindingsCount(findings.length)}
        </p>

        {findings.length === 0 ? (
          <p className="empty-state">Ничего не зафиксировано.</p>
        ) : (
          findings.map((finding) => (
            <article className="finding" key={finding.id}>
              <div className="finding__meta">
                <span>
                  {new Date(finding.timeStamp).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {finding.isGoal && <span className="finding__goal">цель</span>}
              </div>

              {finding.image && (
                <img className="finding__image" src={finding.image} alt="" />
              )}

              <p className="finding__note">{finding.note}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

export default SummaryView;
