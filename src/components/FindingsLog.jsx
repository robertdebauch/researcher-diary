function FindingsLog({ isOpen, findings, onClose, onDeleteFinding }) {
  return (
    <div className={`findings-panel ${isOpen ? "" : "closed"}`}>
      <h2 style={{ marginTop: 0 }}>Журнал находок</h2>
      <div style={{ overflowY: "auto", flexGrow: 1 }}>
        {findings.length === 0 ? (
          <p>Находок пока нет. Исследуйте!</p>
        ) : (
          findings
            .slice()
            .reverse()
            .map((finding) => (
              <div
                key={finding.id}
                className="finding-item"
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "15px 0",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                {/* Миниатюра фото */}
                {finding.image ? (
                  <img
                    src={finding.image}
                    alt="Находка"
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "8px",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "8px",
                      backgroundColor: "#f0f0f0",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                    }}
                  >
                    🖼️
                  </div>
                )}

                <div style={{ flexGrow: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <strong style={{ fontSize: "0.8rem", color: "#888" }}>
                      {new Date(finding.timeStamp).toLocaleString()}
                    </strong>
                    {finding.isGoal && <span title="Цель достигнута!">🎯</span>}
                  </div>

                  <div
                    style={{
                      fontSize: "0.95rem",
                      color: "#333",
                      lineHeight: "1.4",
                    }}
                  >
                    {finding.note}
                  </div>
                  <button
                    onClick={() => onDeleteFinding(finding.id)}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color: "red",
                      fontSize: "1.2rem",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: "20px",
          padding: "10px",
          cursor: "pointer",
          width: "100%",
          borderRadius: "10px",
          border: "none",
          backgroundColor: "#eee",
        }}
      >
        Закрыть
      </button>
    </div>
  );
}

export default FindingsLog;
