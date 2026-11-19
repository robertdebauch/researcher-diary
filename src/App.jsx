import Archive from "./components/Archive";
import MapView from "./components/MapView";
import FindingModal from "./components/FindingModal";
import FindingsLog from "./components/FindingsLog";
import { useFeedback } from "./components/feedbackContext";
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
  isResumableExpedition,
  MAX_ACCURACY_METERS,
  ROUTE_SAVE_INTERVAL_MS,
} from "./utils.js";

function App() {
  const { notify, confirm } = useFeedback();
  const [position, setPosition] = useState(null);
  const [isWalking, setIsWalking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [route, setRoute] = useState([]);
  const [findings, setFindings] = useState([]);
  const [allFindingsInDB, setAllFindingsInDB] = useState([]);
  const [currentExpeditionId, setCurrentExpeditionId] = useState(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isAddingFinding, setIsAddingFinding] = useState(false);
  const [findingName, setFindingName] = useState("");
  const [findingDescription, setFindingDescription] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
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

  // Первая точка после паузы помечается флагом разрыва — по нему рисуются
  // пунктир и знак паузы. Флаг снимаем, когда точка реально записалась.
  const pendingBreakRef = useRef(false);

  // Лист находки читает ключ при открытии: после настроек ему нужна свежая версия.
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setSettingsRevision((revision) => revision + 1);
  }, []);

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
        // Пауза живёт в базе: если закрыли приложение на паузе — так и восстановим.
        setIsPaused(Boolean(activeExpedition.pausedAt));
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
    setIsPaused(false);
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
      if (isWalking && !isPaused && accuracy <= MAX_ACCURACY_METERS) {
        const isSegmentStart = pendingBreakRef.current;
        setRoute((prevRoute) =>
          appendRoutePoint(prevRoute, coordinates, { isSegmentStart }),
        );
      }
    },
    [isWalking, isPaused],
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
      setIsPaused(Boolean(activeExpedition.pausedAt));
      setIsFollowEnabled(true);
      setIsStartModalOpen(false);
      setView("map");
      return;
    }

    const newExpedition = {
      startTime: new Date(),
      endTime: null,
      pausedAt: null,
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
    setIsPaused(false);
    setIsFollowEnabled(true);
    setIsStartModalOpen(false);
    setExpeditionTitle("");
    setExpeditionGoal("");
    setView("map");
  };

  // Старт с карты: либо продолжаем активную экспедицию, либо заводим новую.
  const startWalk = () => {
    if (currentExpeditionId) {
      setIsWalking(true);
      setIsPaused(false);
      setIsFollowEnabled(true);
      return;
    }

    setIsStartModalOpen(true);
  };

  // Пауза не закрывает экспедицию: точки перестают писаться, время не идёт,
  // находку всё равно можно зафиксировать. Признак паузы пишем в базу, иначе
  // после перезапуска приложение решит, что запись шла всё это время.
  const pauseWalk = async () => {
    setIsPaused(true);

    if (!currentExpeditionId) {
      return;
    }

    const pausedAt = new Date();

    // Пауза — естественная граница записи, не ждём окна троттлинга.
    await db.expeditions.update(currentExpeditionId, {
      path: route,
      pausedAt,
    });

    setExpeditions((prevExpeditions) =>
      prevExpeditions.map((expedition) =>
        expedition.id === currentExpeditionId
          ? { ...expedition, path: route, pausedAt }
          : expedition,
      ),
    );
  };

  const resumeWalk = async () => {
    setIsPaused(false);
    setIsFollowEnabled(true);
    // Первая точка после паузы начнёт новый сегмент — на карте будет видно, где стояли.
    pendingBreakRef.current = true;

    if (!currentExpeditionId) {
      return;
    }

    await db.expeditions.update(currentExpeditionId, { pausedAt: null });

    setExpeditions((prevExpeditions) =>
      prevExpeditions.map((expedition) =>
        expedition.id === currentExpeditionId
          ? { ...expedition, pausedAt: null }
          : expedition,
      ),
    );
  };

  const finishWalk = async () => {
    if (currentExpeditionId) {
      const endTime = new Date();

      await db.expeditions.update(currentExpeditionId, {
        endTime,
        path: route,
        pausedAt: null,
      });

      setExpeditions((prevExpeditions) =>
        prevExpeditions.map((expedition) =>
          expedition.id === currentExpeditionId
            ? { ...expedition, endTime, path: route, pausedAt: null }
            : expedition,
        ),
      );
    }

    setIsWalking(false);
    setIsPaused(false);
    pendingBreakRef.current = false;
    setCurrentExpeditionId(null);
  };

  // Продолжить завершённую: снимаем endTime, трекинг включается, линия
  // продолжается новым сегментом (разрыв по времени рисуется как разрыв).
  const resumeExpedition = async (expeditionId) => {
    const expedition = expeditions.find((item) => item.id === expeditionId);

    if (!expedition || !isResumableExpedition(expedition, expeditions)) {
      return;
    }

    await db.expeditions.update(expeditionId, { endTime: null, pausedAt: null });

    setExpeditions((prevExpeditions) =>
      prevExpeditions.map((item) =>
        item.id === expeditionId ? { ...item, endTime: null, pausedAt: null } : item,
      ),
    );

    const resumedFindings = await db.findings
      .where("expeditionId")
      .equals(expeditionId)
      .toArray();

    setCurrentExpeditionId(expeditionId);
    setRoute(expedition.path || []);
    setFindings(resumedFindings);
    setIsWalking(true);
    setIsPaused(false);
    setIsFollowEnabled(true);
    setIsLogOpen(false);
    setView("map");

    // Продолжение после «Остановить» — тоже разрыв, даже если прошло две минуты.
    pendingBreakRef.current = true;
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
      notify("Не удалось обработать изображение", { tone: "error" });
    }
  };

  const addFinding = async () => {
    if (!position) {
      notify("Сначала нужно определить ваше местоположение", { tone: "error" });
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
      notify("Добавьте название или описание", { tone: "error" });
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

      notify("Находка зафиксирована");
    } catch (error) {
      console.error("Ошибка!", error);
      notify("Не удалось сохранить находку", { tone: "error" });
    }
  };

  const deleteFinding = async (findingId) => {
    const shouldDelete = await confirm({
      message: "Удалить эту находку?",
      confirmLabel: "Удалить",
    });

    if (!shouldDelete) {
      return;
    }

    try {
      await db.findings.delete(findingId);

      // Обновляем стейты, чтобы находка мгновенно исчезла с экрана
      setFindings((prev) => prev.filter((f) => f.id !== findingId));
      setAllFindingsInDB((prev) => prev.filter((f) => f.id !== findingId));

      notify("Находка удалена");
    } catch (error) {
      console.error("Ошибка при удалении:", error);
      notify("Не удалось удалить находку", { tone: "error" });
    }
  };

  const deleteExpedition = async (expeditionId) => {
    const shouldDelete = await confirm({
      message: "Удалить экспедицию и все находки в ней?",
      confirmLabel: "Удалить",
    });

    if (!shouldDelete) {
      return false;
    }

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

      notify("Экспедиция удалена");
      return true;
    } catch (error) {
      console.error("Ошибка при удалении экспедиции!", error);
      notify("Не удалось удалить экспедицию", { tone: "error" });
      return false;
    }
  };

  // Удаление живёт только в отчёте: после него уходим в архив.
  const deleteExpeditionFromReport = async (expeditionId) => {
    const isDeleted = await deleteExpedition(expeditionId);

    if (!isDeleted) {
      return;
    }

    // Отчёт можно открыть и для активной прогулки (через «← Архив»),
    // поэтому после удаления гасим трекинг, иначе он останется висеть.
    if (currentExpeditionId === expeditionId) {
      setIsWalking(false);
      setIsPaused(false);
      setCurrentExpeditionId(null);
      setRoute([]);
      setFindings([]);
      pendingBreakRef.current = false;
    }

    setSummaryExpeditionId(null);
    setView("archive");
  };

  const handleHardReset = async () => {
    const shouldReset = await confirm({
      message:
        "Безвозвратно удалить все экспедиции и находки? Вернуть их можно только из бэкапа.",
      confirmLabel: "Удалить всё",
    });

    if (!shouldReset) {
      return;
    }

    try {
      await clearAllData();

      setExpeditions([]);
      setAllFindingsInDB([]);
      setFindings([]);
      setRoute([]);
      setCurrentExpeditionId(null);
      setIsWalking(false);
      setIsPaused(false);
      setView("archive");

      notify("Все данные удалены");
    } catch (error) {
      console.error("Ошибка при полном сбросе:", error);
      notify("Не удалось удалить данные", { tone: "error" });
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
      notify("Бэкап создан");
    } catch (error) {
      console.error("Ошибка при экспорте!", error);
      notify("Не удалось экспортировать данные", { tone: "error" });
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

        notify("Данные восстановлены, страница обновится");
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        console.error("Ошибка при импорте:", error);
        notify("Файл повреждён или имеет неверный формат", { tone: "error" });
      }
    };
    reader.readAsText(file);
  };

  const routeRef = useRef(route);
  const lastRouteSaveRef = useRef(0);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // Флаг разрыва снимаем только после того, как точка с ним действительно
  // записалась: appendRoutePoint может отбросить шум ближе 3 м.
  useEffect(() => {
    const lastPoint = route[route.length - 1];

    if (pendingBreakRef.current && lastPoint && lastPoint[3] === 1) {
      pendingBreakRef.current = false;
    }
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
      notify("Браузер не поддерживает геолокацию", { tone: "error" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      updatePosition,
      (err) => {
        notify(`Не получили координаты: ${err.message}`, { tone: "error" });
      },
      { enableHighAccuracy: true },
    );

    let timer;
    if (isWalking && !isPaused) {
      timer = setInterval(() => {
        navigator.geolocation.getCurrentPosition(updatePosition, null, {
          enableHighAccuracy: true,
        });
      }, 5000);
    }
    return () => clearInterval(timer);
  }, [isWalking, isPaused, updatePosition, notify]);

  const summaryExpedition = expeditions.find(
    (expedition) => expedition.id === summaryExpeditionId,
  );
  // Кнопка «Продолжить» — только у последней и недавно завершённой прогулки.
  const canResumeSummary = isResumableExpedition(
    summaryExpedition,
    expeditions,
  );

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
          onHardReset={handleHardReset}
          onOpenSummary={openSummary}
          onExport={handleExport}
          onImport={handleImport}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      ) : view === "summary" ? (
        <SummaryView
          expedition={summaryExpedition}
          findings={allFindingsInDB.filter(
            (finding) => finding.expeditionId === summaryExpeditionId,
          )}
          onBack={() => setView("archive")}
          onResume={resumeExpedition}
          onDelete={deleteExpeditionFromReport}
          canResume={canResumeSummary}
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
            isPaused={isPaused}
            onStart={startWalk}
            onPause={pauseWalk}
            onResume={resumeWalk}
            onFinish={finishWalk}
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
        settingsRevision={settingsRevision}
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
        onClose={closeSettings}
      />
    </div>
  );
}

export default App;
