function Archive({
  expeditions,
  allFindings,
  onSelect,
  onStart,
  onDeleteExpedition,
  onHardReset,
  onOpenSummary,
  onExport,
  onImport,
}) {
  return (
    <div className="list-view-container">
      <h1 style={{ textAlign: "center", color: "#333" }}>Мой дневник</h1>
      <button
        onClick={onStart}
        style={{
          width: "100%",
          padding: "15px",
          fontSize: "1.2rem",
          borderRadius: "15px",
          border: "none",
          backgroundColor: "#4caf50",
          color: "white",
          cursor: "pointer",
          marginBottom: "20px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        Начать новую экспедицию
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {expeditions.length === 0 ? (
          <p style={{ textAlign: "center", color: "#888" }}>
            Экспедиций пока нет
          </p>
        ) : (
          expeditions.map((exp) => {
            const expeditionFindings = allFindings.filter(
              (f) => f.expeditionId === exp.id,
            );

            const goalFinding = expeditionFindings.find(
              (f) => f.isGoal && f.image,
            );
            const anyFinding = expeditionFindings.find((f) => f.image);
            const previewImage = goalFinding?.image || anyFinding?.image;

            return (
              <div
                key={exp.id}
                onClick={() => onSelect(exp)}
                style={{
                  position: "relative",
                  backgroundColor: "white",
                  padding: "15px",
                  borderRadius: "15px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  display: "flex",
                  gap: "15px",
                  alignItems: "center",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "scale(1.02)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "scale(1)")
                }
              >
                {/* Превью-картинка */}
                <div
                  style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    backgroundColor: "#eee",
                    flexShrink: 0,
                  }}
                >
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Превью"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        fontSize: "2rem",
                      }}
                    >
                      🗺️
                    </div>
                  )}
                </div>

                <div style={{ flexGrow: 1 }}>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "1.1rem",
                      color: "#333",
                    }}
                  >
                    {exp.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#666",
                      marginBottom: "5px",
                    }}
                  >
                    Цель: {exp.goal}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#999" }}>
                    {new Date(exp.startTime).toLocaleString()}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteExpedition(exp.id);
                  }}
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "1.1rem",
                    color: "#ccc", // Светло-серый, чтобы не отвлекать
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "red")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ccc")}
                  title="Удалить экспедицию"
                >
                  🗑️
                </button>

                <div style={{ textAlign: "right", minWidth: "80px" }}>
                  <div
                    style={{
                      color: "#2196f3",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    {expeditionFindings.length} находок
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSummary(exp.id);
                    }}
                    style={{
                      color: "#4caf50",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    Отчет →
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "20px",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={onExport}
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "0.8rem",
            color: "#666",
          }}
        >
          💾 Экспорт (JSON)
        </button>

        <label
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "0.8rem",
            color: "#666",
            textAlign: "center",
            display: "block",
          }}
        >
          📥 Импорт (JSON)
          <input
            type="file"
            accept=".json"
            onChange={onImport}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {expeditions.length > 0 && (
        <button
          onClick={onHardReset}
          style={{
            width: "100%",
            marginTop: "40px",
            padding: "10px",
            backgroundColor: "transparent",
            color: "#aaa",
            border: "1px solid #ddd",
            borderRadius: "10px",
            cursor: "pointer",
            fontSize: "0.8rem",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "red")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa")}
        >
          Полный сброс всех данных
        </button>
      )}
    </div>
  );
}

export default Archive;
