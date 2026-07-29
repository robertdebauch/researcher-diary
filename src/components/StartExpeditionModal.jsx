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
      style={{
        position: "fixed", // Изменили с absolute на fixed
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "20px",
          width: "80%",
          maxWidth: "400px",
          boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Новая экспедиция</h3>

        <div style={{ marginBottom: "15px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "5px",
              fontSize: "0.9rem",
              color: "#666",
            }}
          >
            Название прогулки:
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Лес у озера"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "5px",
              fontSize: "0.9rem",
              color: "#666",
            }}
          >
            Ваша цель:
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Что хотите найти?"
            style={{
              width: "100%",
              height: "80px",
              padding: "10px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              backgroundColor: "#ccc",
            }}
          >
            Отмена
          </button>
          <button
            onClick={onStart}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              backgroundColor: "#4caf50",
              color: "white",
            }}
          >
            В путь!
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartExpeditionModal;
