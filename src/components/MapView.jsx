import L from "leaflet";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Polyline,
} from "react-leaflet";

function RecenterMap({ position, route }) {
  const map = useMap();

  useEffect(() => {
    if (route && route.length > 0) {
      const bounds = L.polyline(route).getBounds();

      map.fitBounds(bounds, { padding: [20, 20] });
    } else if (position) {
      map.setView(position);
    }
  }, [position, route, map]);
  return null;
}

function MapView({
  currentExpeditionId,
  position,
  route,
  findings,
  isWalking,
  toggleWalking,
  addFinding,
  isLogOpen,
  setIsLogOpen,
  goBackToArchive,
}) {
  return (
    <>
      <button
        onClick={goBackToArchive}
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 1001,
          padding: "10px",
          borderRadius: "10px",
          border: "none",
          backgroundColor: "white",
          cursor: "pointer",
          boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
        }}
      >
        В архив
      </button>
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          backgroundColor: "white",
          padding: "10px 20px",
          borderRadius: "20px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          cursor: "pointer",
        }}
      >
        {isWalking || !currentExpeditionId ? (
          <button
            onClick={toggleWalking}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              borderRadius: "15px",
              border: "none",
              backgroundColor: isWalking ? "#ff4d4d" : "#4caf50",
              color: "white",
              cursor: "pointer",
            }}
          >
            {isWalking ? "Остановить прогулку" : "Начать прогулку"}
          </button>
        ) : (
          <div
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              color: "#666",
              marginBottom: "10px",
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            Просмотр архива
          </div>
        )}

        {isWalking && (
          <button
            onClick={addFinding}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              borderRadius: "15px",
              border: "none",
              backgroundColor: "#2196f3",
              color: "white",
              cursor: "pointer",
              marginTop: "10px",
              display: "block",
              width: "100%",
            }}
          >
            Зафиксировать находку
          </button>
        )}

        <button
          onClick={() => setIsLogOpen(!isLogOpen)}
          style={{
            padding: "10px 20px",
            fontSize: "1rem",
            borderRadius: "15px",
            border: "none",
            backgroundColor: "#607d8b",
            color: "white",
            cursor: "pointer",
            marginTop: "10px",
            display: "block",
            width: "100%",
          }}
        >
          {isLogOpen ? "Закрыть журнал" : "Открыть журнал"}
        </button>
      </div>

      {!position ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontSize: "1.5rem",
          }}
        >
          Определяем ваше местоположение...
        </div>
      ) : (
        <MapContainer
          center={position}
          zoom={15}
          style={{
            height: "100%",
            width: "100%",
          }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <Marker position={position}>
            <Popup>Вы здесь!</Popup>
          </Marker>
          {findings.map((finding) => (
            <Marker key={finding.id} position={finding.position}>
              <Popup>
                <div style={{ textAlign: "center", maxWidth: "200px" }}>
                  {/* Если есть фото, показываем его сверху */}
                  {finding.image && (
                    <img
                      src={finding.image}
                      alt="Находка"
                      style={{
                        width: "100%",
                        borderRadius: "8px",
                        marginBottom: "8px",
                        display: "block",
                      }}
                    />
                  )}

                  <strong style={{ display: "block", marginBottom: "4px" }}>
                    {finding.isGoal ? "🎯 Цель найдена!" : "Находка!"}
                  </strong>

                  <div style={{ fontSize: "0.9rem", marginBottom: "8px" }}>
                    {finding.note}
                  </div>

                  <small style={{ color: "#888", display: "block" }}>
                    {new Date(finding.timeStamp).toLocaleString()}
                  </small>
                </div>
              </Popup>
            </Marker>
          ))}
          <Polyline positions={route} color="blue" weight={4} opacity={0.7} />
          <RecenterMap position={position} route={route} />
        </MapContainer>
      )}
    </>
  );
}

export default MapView;
