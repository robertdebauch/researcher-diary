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
      style={{
        position: "fixed",
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
        <h3 style={{ marginTop: 0 }}>Что вы нашли?</h3>

        <textarea
          style={{
            width: "100%",
            height: "100px",
            marginBottom: "15px",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            boxSizing: "border-box",
          }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Опишите вашу находку..."
        />

        {/* СЕКЦИЯ ФОТО - теперь отдельно */}
        <div style={{ marginBottom: "15px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "5px",
              fontSize: "0.9rem",
              color: "#666",
            }}
          >
            Фото находки:
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onImageChange}
            style={{ width: "100%" }}
          />
          {image && (
            <img
              src={image}
              alt="Preview"
              style={{
                width: "100%",
                height: "100px",
                objectFit: "cover",
                marginTop: "10px",
                borderRadius: "10px",
              }}
            />
          )}
        </div>

        {/* СЕКЦИЯ ЦЕЛИ - теперь отдельно */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
            backgroundColor: "#e3f2fd",
            padding: "10px",
            borderRadius: "10px",
          }}
        >
          <input
            type="checkbox"
            id="goal-check"
            checked={isGoal || false} // Добавил || false чтобы не было ошибки с null
            onChange={(e) => setIsGoal(e.target.checked)}
            style={{ width: "20px", height: "20px" }}
          />
          <label
            htmlFor="goal-check"
            style={{
              cursor: "pointer",
              fontWeight: "bold",
              color: "#1976d2",
            }}
          >
            Это была моя цель! 🎯
          </label>
        </div>

        {/* КНОПКИ - теперь в своем отдельном контейнере */}
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
            onClick={onSave}
            style={{
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              backgroundColor: "#2196f3",
              color: "white",
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default FindingModal;
