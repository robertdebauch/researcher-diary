import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
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
import { filterImplausiblePoints, splitRouteIntoSegments } from "../utils.js";

function MapCamera({
  position,
  route,
  isWalking,
  currentExpeditionId,
  followEnabled,
  onFollowDisabled,
}) {
  const map = useMap();
  const fittedExpeditionRef = useRef(null);

  // Во время прогулки следуем за пользователем, пока он сам не сдвинул карту.
  useEffect(() => {
    if (!isWalking || !followEnabled || !position) {
      return;
    }

    map.panTo(position, { animate: true, duration: 0.5 });
  }, [position, isWalking, followEnabled, map]);

  // Просмотр архива: показываем весь маршрут один раз при открытии экспедиции,
  // дальше карта принадлежит пользователю (раньше fitBounds дёргался каждые 5 секунд).
  useEffect(() => {
    if (isWalking || !currentExpeditionId) {
      return;
    }

    if (fittedExpeditionRef.current === currentExpeditionId) {
      return;
    }

    fittedExpeditionRef.current = currentExpeditionId;

    if (route && route.length > 1) {
      const bounds = L.polyline(route).getBounds();
      map.fitBounds(bounds, { padding: [20, 20] });
    } else if (position) {
      map.setView(position, 15);
    }
  }, [isWalking, currentExpeditionId, route, position, map]);

  // Любое ручное движение карты выключает автопрокрутку.
  useEffect(() => {
    map.on("dragstart", onFollowDisabled);
    map.on("zoomstart", onFollowDisabled);

    return () => {
      map.off("dragstart", onFollowDisabled);
      map.off("zoomstart", onFollowDisabled);
    };
  }, [map, onFollowDisabled]);

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
  isFollowEnabled,
  onToggleFollow,
  onFollowDisabled,
  goBackToArchive,
}) {
  const mapRef = useRef(null);
  const clusterGroupRef = useRef(null);

  const routeSegments = useMemo(
    () =>
      splitRouteIntoSegments(route)
        .map((segment) => filterImplausiblePoints(segment))
        .filter((segment) => segment.length > 1),
    [route],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Кластер-группа лежит на карте как LayerGroup, а не как Marker,
    // поэтому старый слой нужно снимать явно — иначе каждый новый набор
    // находок добавляет ещё один слой, и маркеры дублируются.
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 0,
      spiderfyOnMaxZoom: true,
      showCoverageOnMap: false,
    });

    const buildIcon = (finding, size) =>
      L.divIcon({
        className: `custom-marker-icon ${finding.isGoal ? "marker-goal" : ""}`,
        html: finding.image
          ? `<img src="${finding.image}" class="custom-marker-img" />`
          : `<div class="custom-marker-placeholder">+</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

    findings.forEach((finding) => {
      const baseSize = finding.isGoal ? 54 : 44;

      const marker = L.marker(finding.position, {
        icon: buildIcon(finding, baseSize),
        customMarker: true,
        // Цель — поверх остальных: масштаб виден даже при наслоении.
        zIndexOffset: finding.isGoal ? 400 : 0,
      });

      // Акцент «выбранной» точки — масштабом, а не обводкой.
      marker.on("popupopen", () => marker.setIcon(buildIcon(finding, baseSize + 14)));
      marker.on("popupclose", () => marker.setIcon(buildIcon(finding, baseSize)));

      const labelColor = finding.isGoal ? "#c7e36a" : "#999";

      marker.bindPopup(`
        <div style="max-width: 230px;">
          ${finding.image ? `<img src="${finding.image}" style="display: block; width: 100%;" />` : ""}
          <div style="padding: 10px 12px 12px;">
            <div style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${labelColor}; margin-bottom: 6px;">${finding.isGoal ? "цель найдена" : "находка"}</div>
            <div style="font-family: var(--font-note); font-style: italic; font-size: 15px; line-height: 1.4; color: #fff;">${finding.note}</div>
            <div style="margin-top: 8px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; color: #636362;">${new Date(finding.timeStamp).toLocaleString()}</div>
          </div>
        </div>
      `);

      clusterGroup.addLayer(marker);
    });

    clusterGroupRef.current = clusterGroup;
    map.addLayer(clusterGroup);

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
    };
  }, [findings]);

  return (
    <>
      <div className="map-overlay">
        <button className="map-chip" onClick={goBackToArchive}>
          ← Архив
        </button>

        <button className="map-chip" onClick={() => setIsLogOpen(!isLogOpen)}>
          Журнал · {findings.length}
        </button>
      </div>

      {!position ? (
        <div className="geo-waiting">Определяем ваше местоположение…</div>
      ) : (
        <MapContainer
          center={position}
          zoom={15}
          maxZoom={18}
          zoomControl={false}
          style={{
            height: "100%",
            width: "100%",
          }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <Marker
            position={position}
            icon={L.divIcon({
              className: "custom-marker-icon marker-position",
              html: "",
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Popup>Вы здесь</Popup>
          </Marker>

          {routeSegments.map((segment, index) => (
            <Polyline
              key={`route-segment-${index}`}
              positions={segment}
            />
          ))}
          <MapCamera
            position={position}
            route={route}
            isWalking={isWalking}
            currentExpeditionId={currentExpeditionId}
            followEnabled={isFollowEnabled}
            onFollowDisabled={onFollowDisabled}
          />
        </MapContainer>
      )}

      <div className="map-bottom">
        {isWalking || !currentExpeditionId ? (
          <button className="map-chip" onClick={toggleWalking}>
            {isWalking ? "Остановить" : "Начать прогулку"}
          </button>
        ) : (
          <span className="map-chip map-chip--muted">Просмотр</span>
        )}

        {isWalking && (
          <button className="map-chip map-chip--muted" onClick={onToggleFollow}>
            {isFollowEnabled ? "слежу" : "следить"}
          </button>
        )}
      </div>

      {isWalking && position && (
        <button
          className="shutter"
          onClick={addFinding}
          aria-label="Зафиксировать находку"
        >
          +
        </button>
      )}
    </>
  );
}

export default MapView;
