import { calculateTotalDistance, calculateAverageSpeed } from "../utils";

function SummaryView({ expedition, findings, onBack }) {
  const calculateDuration = () => {
    if (!expedition.startTime || !expedition.endTime) {
      return "Неизвестно";
    }

    const difference =
      new Date(expedition.endTime) - new Date(expedition.startTime);
    const minutes = Math.floor(difference / 60000);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}ч ${minutes}м` : `${minutes} мин`;
  };

  const isGoalReached = findings.some((finding) => finding.isGoal);

  const totalDistance = calculateTotalDistance(expedition.path);

  const averageSpeed = calculateAverageSpeed(
    totalDistance,
    expedition.startTime,
    expedition.endTime,
  );

  return (
    <div className="list-view-container summary-view-container">
      <button
        onClick={onBack}
        style={{
          border: "none",
          background: "none",
          color: "#2196f3",
          cursor: "pointer",
          fontSize: "1rem",
          padding: "0",
          marginBottom: "20px",
        }}
      >
        ← Вернуться в архив
      </button>

      <header style={{ textAlign: "center", marginBottom: "30px" }}>
        <h1 style={{ fontSize: "1.8rem", margin: "0 0 10px 0" }}>
          {expedition.title}
        </h1>
        <p style={{ color: "#666", fontSize: "1.1rem", fontStyle: "italic" }}>
          «{expedition.goal}»
        </p>
        <div
          style={{
            display: "inline-block",
            backgroundColor: "#eee",
            padding: "5px 15px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            color: "#888",
          }}
        >
          {new Date(expedition.startTime).toLocaleDateString()} •{" "}
          {calculateDuration()}
        </div>
      </header>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "15px",
          justifyContent: "space-around",
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "15px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
          marginBottom: "30px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {findings.length}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#999" }}>Находок</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {totalDistance}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#999" }}>км пути</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {averageSpeed}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#999" }}>км/ч</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {isGoalReached ? "✅" : "❌"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#999" }}>Цель</div>
        </div>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2
          style={{
            fontSize: "1.2rem",
            borderBottom: "2px solid #eee",
            paddingBottom: "10px",
          }}
        >
          Что было найдено:
        </h2>

        {findings.length === 0 ? (
          <p style={{ textAlign: "center", color: "#aaa" }}>
            Ничего не зафиксировано
          </p>
        ) : (
          findings.map((finding) => (
            <div
              key={finding.id}
              style={{
                backgroundColor: "white",
                borderRadius: "15px",
                overflow: "hidden",
                boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
              }}
            >
              {finding.image && (
                <img
                  src={finding.image}
                  alt="Находка"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              )}
              <div style={{ padding: "15px" }}>
                <div
                  style={{
                    fontSize: "0.8rem",
                    color: "#aaa",
                    marginBottom: "5px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>
                    {new Date(finding.timeStamp).toLocaleTimeString()}
                  </span>
                  {finding.isGoal && (
                    <span style={{ color: "#4caf50", fontWeight: "bold" }}>
                      ЦЕЛЬ!
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "1rem", lineHeight: "1.4" }}>
                  {finding.note}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SummaryView;
