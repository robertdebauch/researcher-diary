import { formatFindingsCount } from "../utils";

function FindingsLog({ isOpen, findings, onClose, onDeleteFinding }) {
  return (
    <aside
      className={`findings-panel ${isOpen ? "" : "closed"}`}
      aria-hidden={!isOpen}
    >
      <p className="section__label">
        Журнал · {formatFindingsCount(findings.length)}
      </p>
      <h2 className="sheet__title">Находки</h2>

      <div className="findings-panel__list">
        {findings.length === 0 ? (
          <p className="empty-state">Находок пока нет. Исследуйте.</p>
        ) : (
          findings
            .slice()
            .reverse()
            .map((finding) => (
              <article className="finding-item" key={finding.id}>
                <div className="finding-item__head">
                  <span>
                    {new Date(finding.timeStamp).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {finding.isGoal && (
                    <span className="finding__goal">цель</span>
                  )}
                </div>

                {finding.image && (
                  <img
                    className="finding-item__image"
                    src={finding.image}
                    alt=""
                  />
                )}

                <p className="finding-item__note">{finding.note}</p>

                <button
                  className="btn btn--muted btn--danger"
                  onClick={() => onDeleteFinding(finding.id)}
                >
                  удалить
                </button>
              </article>
            ))
        )}
      </div>

      <button className="btn btn--muted" onClick={onClose}>
        Закрыть журнал
      </button>
    </aside>
  );
}

export default FindingsLog;
