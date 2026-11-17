import Archive from "./components/Archive";
import MapView from "./components/MapView";
import FindingModal from "./components/FindingModal";
import FindingsLog from "./components/FindingsLog";
import SettingsSheet from "./components/SettingsSheet";
import StartExpeditionModal from "./components/StartExpeditionModal";
import SummaryView from "./components/SummaryView";

import { useState, useEffect, useCallback, useRef } from "react";
// Порядок важен: стили Leaflet подключаем ДО App.css, иначе дефолты Leaflet
// перебивают наши правила (белые скруглённые попапы, тени).
import "leaflet/dist/leaflet.css";
import "./App.css";
import { db, clearAllData, exportAllData, importAllData } from "./db";
import {
  compressImage,
  appendRoutePoint,
  MAX_ACCURACY_METERS,
  ROUTE_SAVE_INTERVAL_MS,
} from "./utils.js";

function App() {
  const [position, setPosition] = useState(null);
  const [isWalking, setIsWalking] = useState(false);
  const [route, setRoute] = useState([]);
  const [findings, setFindings] = useState([]);
  const [allFindingsInDB, setAllFindingsInDB] = useState([]);
  const [currentExpeditionId, setCurrentExpeditionId] = useState(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isAddingFinding, setIsAddingFinding] = useState(false);
  const [findingName, setFindingName] = useState("");
  const [findingDescription, setFindingDescription] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [view, setView] = useState("archive");
  const [expeditions, setExpeditions] = useState([]);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [expeditionTitle, setExpeditionTitle] = useState("");
  const [expeditionGoal, setExpeditionGoal] = useState("");
  const [findingImage, setFindingImage] = useState(null);
  const [isGoal, setIsGoal] = useState(false);
  const [summaryExpeditionId, setSummaryExpeditionId] = useState(null);
  // Автопрокрутка карты за пользователем. Живёт в App, чтобы сбрасываться
  // в момент старта/открытия экспедиции, а не в эффекте MapView.
  const [isFollowEnabled, setIsFollowEnabled] = useState(true);

  const disableFollow = useCallback(() => setIsFollowEnabled(false), []);
  const toggleFollow = useCallback(
    () => setIsFollowEnabled((prevEnabled) => !prevEnabled),
    [],
  );

  useEffect(() => {
    async function loadData() {
      const allExpeditions = await db.expeditions
        .orderBy("id")
        .reverse()
        .toArray();
      setExpeditions(allExpeditions);

      const allFindings = await db.findings.toArray();
      setAllFindingsInDB(allFindings);

      const activeExpedition = allExpeditions.find((exp) => !exp.endTime);

      if (activeExpedition) {
        setCurrentExpeditionId(activeExpedition.id);
        setRoute(activeExpedition.path || []);
        setIsWalking(true);
        setIsFollowEnabled(true);
        setView("map");

        const activeFindings = await db.findings
          .where("expeditionId")
          .equals(activeExpedition.id)
          .toArray();
        setFindings(activeFindings);
      } else {
        setFindings([]);
      }
    }
    loadData();
  }, []);

  const selectExpedition = (expedition) => {
    setCurrentExpeditionId(expedition.id);
    setRoute(expedition.path || []);
    setIsFollowEnabled(true);

    db.findings
      .where("expeditionId")
      .equals(expedition.id)
      .toArray()
      .then((filteredFindings) => {
        setFindings(filteredFindings);
      });

    setView("map");
    setIsWalking(false);
  };

  const openSummary = (expeditionId) => {
    setSummaryExpeditionId(expeditionId);
    setView("summary");
  };

  const updatePosition = useCallback(
    (pos) => {
      const coordinates = [pos.coords.latitude, pos.coords.longitude];
      const accuracy = pos.coords.accuracy ?? 0;
      setPosition(coordinates);

      // Неточные точки (дома, в начале трека, в подворотне) не пишем в маршрут:
      // они дают те самые «броски» линии через полкарты.
      if (isWalking && accuracy <= MAX_ACCURACY_METERS) {
        setRoute((prevRoute) => appendRoutePoint(prevRoute, coordinates));
      }
    },
    [isWalking],
  );

  const startExpedition = async () => {
    // Защита от «висящей» экспедиции: если в базе уже есть незавершённая,
    // продолжаем её, а не создаём дубль (иначе в БД остаётся запись без endTime).
    const activeExpedition = expeditions.find(
      (expedition) => !expedition.endTime,
    );

    if (activeExpedition) {
      const activeFindings = await db.findings
        .where("expeditionId")
        .equals(activeExpedition.id)
        .toArray();

      setCurrentExpeditionId(activeExpedition.id);
      setRoute(activeExpedition.path || []);
      setFindings(activeFindings);
      setIsWalking(true);
      setIsFollowEnabled(true);
      setIsStartModalOpen(false);
      setView("map");
      return;
    }

    const newExpedition = {
      startTime: new Date(),
      endTime: null,
      path: [],
      title: expeditionTitle.trim() || "Без названия",
      goal: expeditionGoal.trim() || "Исследование",
    };

    const id = await db.expeditions.add(newExpedition);

    // Держим state в синхроне с базой, иначе архив не увидит новую прогулку
    // до перезагрузки страницы.
    setExpeditions((prevExpeditions) => [
      { ...newExpedition, id },
      ...prevExpeditions,
    ]);

    setCurrentExpeditionId(id);
    setRoute([]);
    setFindings([]);
    setIsWalking(true);
    setIsFollowEnabled(true);
    setIsStartModalOpen(false);
    setExpeditionTitle("");
    setExpeditionGoal("");
    setView("map");
  };

  const toggleWalking = async () => {
    if (!isWalking) {
      if (currentExpeditionId) {
        setIsWalking(true);
      } else {
        setIsStartModalOpen(true);
      }
    } else {
      if (currentExpeditionId) {
        const endTime = new Date();

        await db.expeditions.update(currentExpeditionId, {
          endTime,
          path: route,
        });

        // Синхронизируем state: иначе в архиве у этой прогулки не будет
        // endTime (отчёт покажет «Неизвестно») и последних точек маршрута.
        setExpeditions((prevExpeditions) =>
          prevExpeditions.map((expedition) =>
            expedition.id === currentExpeditionId
              ? { ...expedition, endTime, path: route }
              : expedition,
          ),
        );
      }
      setIsWalking(false);
      setCurrentExpeditionId(null);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    try {
      const compressedImage = await compressImage(file);
      console.log("Размер сжатого фото:", compressedImage.length, "байт");
      setFindingImage(compressedImage);
    } catch (error) {
      console.error("Ошибка при сжатии изображения:", error);
      alert("Не удалось обработать изображение");
    }
  };

  const addFinding = async () => {
    if (!position) {
      alert("Сначала нужно определить ваше местоположение");
      return;
    }
    setFindingName("");
    setFindingDescription("");
    setIsAddingFinding(true);
  };

  const saveFinding = async () => {
    const trimmedName = findingName.trim();
    const trimmedDescription = findingDescription.trim();

    if (!trimmedName && !trimmedDescription) {
      alert("Добавьте название или описание");
      return;
    }

    const newFinding = {
      position: position,
      timeStamp: new Date(),
      name: trimmedName,
      description: trimmedDescription,
      expeditionId: currentExpeditionId,
      image: findingImage,
      isGoal: isGoal,
    };

    try {
      // Dexie возвращает ключ записи — без него у находки в state нет id,
      // из-за чего ломаются React-ключи и удаление.
      const findingId = await db.findings.add(newFinding);
      const savedFinding = { ...newFinding, id: findingId };

      setFindings((prev) => [...prev, savedFinding]);
      setAllFindingsInDB((prev) => [...prev, savedFinding]);

      // СБРОС состояний после сохранения
      setIsAddingFinding(false);
      setFindingName("");
      setFindingDescription("");
      setFindingImage(null);
      setIsGoal(false);

      alert("Находка зафиксирована!");
    } catch (error) {
      console.error("Ошибка!", error);
    }
  };

  const deleteFinding = async (findingId) => {
    if (window.confirm("Вы уверены, что хотите удалить эту находку?")) {
      try {
        await db.findings.delete(findingId);

        // Обновляем стейты, чтобы находка мгновенно исчезла с экрана
        setFindings((prev) => prev.filter((f) => f.id !== findingId));
        setAllFindingsInDB((prev) => prev.filter((f) => f.id !== findingId));

        alert("Находка удалена");
      } catch (error) {
        console.error("Ошибка при удалении:", error);
        alert("Не удалось удалить находку");
      }
    }
  };

  const deleteExpedition = async (expeditionId) => {
    if (
      window.confirm(
        "Вы уверены, что хотите удалить всю экспедицию и все находки в ней?",
      )
    ) {
      try {
        const findingsToDelete = await db.findings
          .where("expeditionId")
          .equals(expeditionId)
          .toArray();

        await Promise.all(
          findingsToDelete.map((finding) => db.findings.delete(finding.id)),
        );

        await db.expeditions.delete(expeditionId);

        setExpeditions((prev) => prev.filter((exp) => exp.id !== expeditionId));
        setAllFindingsInDB((prev) =>
          prev.filter((f) => f.expeditionId !== expeditionId),
        );

        alert("Экспедиция полностью удалена");
      } catch (error) {
        console.error("Ошибка при удалении экспедиции!", error);
        alert("Не удалось удалить экспедицию!");
      }
    }
  };

  const handleHardReset = async () => {
    if (
      window.confirm(
        "⚠️ ВНИМАНИЕ! Это безвозвратно удалит ВСЕ ваши экспедиции и находки. Вы уверены?",
      )
    ) {
      try {
        await clearAllData();

        setExpeditions([]);
        setAllFindingsInDB([]);
        setFindings([]);
        setRoute([]);
        setCurrentExpeditionId(null);
        setIsWalking(false);
        setView("archive");

        alert("Все данные успешно удалены!");
      } catch (error) {
        console.error("Ошибка при полном сбросе:", error);
        alert("Произошла ошибка при удалении данных");
      }
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportAllData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `explorer_backup_${new Date().toISOString().slice(0, 10)}.json`; // это хорошо?
      link.click();

      URL.revokeObjectURL(url);
      alert("Бэкап успешно создан");
    } catch (error) {
      console.error("Ошибка при экспорте!", error);
      alert("Не удалось экспортировать данные");
    }
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        await importAllData(json);

        alert("Данные успешно восстановлены! Сейчас страница обновится");
        window.location.reload();
      } catch (error) {
        console.error("Ошибка при импорте:", error);
        alert("Ошибка: файл поврежден или имеет неверный формат");
      }
    };
    reader.readAsText(file);
  };

  const routeRef = useRef(route);
  const lastRouteSaveRef = useRef(0);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // Троттлинг записи: раньше весь массив точек перезаписывался каждые 5 секунд —
  // на длинной прогулке это O(n²) по объёму записи и лишняя нагрузка на IndexedDB.
  // Теперь пишем не чаще раза в ROUTE_SAVE_INTERVAL_MS.
  useEffect(() => {
    if (route.length === 0 || !currentExpeditionId) {
      return;
    }

    if (Date.now() - lastRouteSaveRef.current < ROUTE_SAVE_INTERVAL_MS) {
      return;
    }

    lastRouteSaveRef.current = Date.now();
    db.expeditions.update(currentExpeditionId, { path: route });
  }, [route, currentExpeditionId]);

  // Страховка: при уходе страницы в фон или закрытии вкладки сохраняем маршрут
  // принудительно, не дожидаясь окна троттлинга.
  useEffect(() => {
    if (!currentExpeditionId) {
      return;
    }

    function persistRoute() {
      db.expeditions.update(currentExpeditionId, { path: routeRef.current });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        persistRoute();
      }
    }

    window.addEventListener("pagehide", persistRoute);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", persistRoute);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentExpeditionId]);

  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Браузер не поддерживает геолокацию!");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      updatePosition,
      (err) => {
        alert("Error: " + err.message);
      },
      { enableHighAccuracy: true },
    );

    let timer;
    if (isWalking) {
      timer = setInterval(() => {
        navigator.geolocation.getCurrentPosition(updatePosition, null, {
          enableHighAccuracy: true,
        });
      }, 5000);
    }
    return () => clearInterval(timer);
  }, [isWalking, updatePosition]);

  return (
    <div className="app-container">
      {" "}
      {/* 1. Главный контейнер теперь разрешает скролл */}
      {view === "archive" ? (
        <Archive
          expeditions={expeditions}
          allFindings={allFindingsInDB}
          onSelect={selectExpedition}
          onStart={() => setIsStartModalOpen(true)}
          onDeleteExpedition={deleteExpedition}
          onHardReset={handleHardReset}
          onOpenSummary={openSummary}
          onExport={handleExport}
          onImport={handleImport}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      ) : view === "summary" ? (
        <SummaryView
          expedition={expeditions.find(
            (expedition) => expedition.id === summaryExpeditionId,
          )}
          findings={allFindingsInDB.filter(
            (finding) => finding.expeditionId === summaryExpeditionId,
          )}
          onBack={() => setView("archive")}
        />
      ) : (
        <div className="map-view-container">
          {" "}
          {/* 2. Этот класс ТОЛЬКО для режима карты */}
          <MapView
            currentExpeditionId={currentExpeditionId}
            position={position}
            route={route}
            findings={findings}
            isWalking={isWalking}
            toggleWalking={toggleWalking}
            addFinding={addFinding}
            isLogOpen={isLogOpen}
            setIsLogOpen={setIsLogOpen}
            isFollowEnabled={isFollowEnabled}
            onToggleFollow={toggleFollow}
            onFollowDisabled={disableFollow}
            goBackToArchive={() => setView("archive")}
          />
          <FindingsLog
            isOpen={isLogOpen}
            findings={findings}
            onClose={() => setIsLogOpen(false)}
            onDeleteFinding={deleteFinding}
          />
        </div>
      )}
      <FindingModal
        isOpen={isAddingFinding}
        name={findingName}
        setName={setFindingName}
        description={findingDescription}
        setDescription={setFindingDescription}
        onSave={saveFinding}
        onClose={() => setIsAddingFinding(false)}
        image={findingImage}
        onImageChange={handleImageChange}
        isGoal={isGoal}
        setIsGoal={setIsGoal}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <StartExpeditionModal
        isOpen={isStartModalOpen}
        title={expeditionTitle}
        setTitle={setExpeditionTitle}
        goal={expeditionGoal}
        setGoal={setExpeditionGoal}
        onStart={startExpedition}
        onClose={() => setIsStartModalOpen(false)}
      />
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
