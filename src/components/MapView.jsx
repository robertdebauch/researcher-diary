import L from "leaflet";
import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Polyline,
} from "react-leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

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
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || !findings) return;

    // Удаляем старые маркеры, если они были
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer.options.customMarker) {
        mapRef.current.removeLayer(layer);
      }
    });

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 0,
      spiderfyOnMaxZoom: true,
      showCoverageOnMap: false,
    });

    findings.forEach((finding) => {
      const customIcon = L.divIcon({
        className: `custom-marker-icon ${finding.isGoal ? "marker-goal" : ""}`,
        html: finding.image
          ? `<img src="${finding.image}" class="custom-marker-img" />`
          : `<div class="custom-marker-placeholder">📍</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = L.marker(finding.position, {
        icon: customIcon,
        customMarker: true,
      });

      marker.bindPopup(`
        <div style="text-align: center; max-width: 200px;">
          ${finding.image ? `<img src="${finding.image}" style="width: 100%; border-radius: 8px; margin-bottom: 8px;" />` : ""}
          <strong style="display: block; margin-bottom: 4px;">${finding.isGoal ? "🎯 Цель найдена!" : "Находка!"}</strong>
          <div style="font-size: 0.9rem; margin-bottom: 8px;">${finding.note}</div>
          <small style="color: #888; display: block;">${new Date(finding.timeStamp).toLocaleString()}</small>
        </div>
      `);

      clusterGroup.addLayer(marker);
    });

    mapRef.current.addLayer(clusterGroup);
  }, [findings]);

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
          maxZoom={18}
          style={{
            height: "100%",
            width: "100%",
          }}
          ref={mapRef} // Привязываем ссылку на карту
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <Marker
            position={position}
            icon={L.divIcon({
              className: "custom-marker-icon",
              html: '<div class="custom-marker-placeholder" style="background: #2196f3; color: white;">📍</div>',
              iconSize: [40, 40],
              iconAnchor: [20, 20],
            })}
          >
            <Popup>Вы здесь!</Popup>
          </Marker>

          <Polyline positions={route} color="blue" weight={4} opacity={0.7} />
          <RecenterMap position={position} route={route} />
        </MapContainer>
      )}
    </>
  );
}

export default MapView;
