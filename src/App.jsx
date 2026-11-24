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
import { logDiagnostic } from "./diagnostics";
import {
  loadExpeditionsWithoutDebug,
  removeDebugData,
  seedDebugData,
} from "./debugStore";
import {
  compressImage,
  appendRoutePoint,
  canPersistRoute,
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
  const [diagnostics, setDiagnostics] = useState([]);
  const [debugCount, setDebugCount] = useState(0);
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
  const routeRef = useRef(route);
  const lastRouteSaveRef = useRef(0);

  // watchPosition присылает обновления чаще, чем нужен шаг маршрута.
  const MIN_POINT_INTERVAL_MS = 4000;

  const lastAppendAtRef = useRef(0);
  const lastFlushAtRef = useRef(0);
  const countersRef = useRef({
    accepted: 0,
    droppedAccuracy: 0,
    skippedThrottle: 0,
    skippedPaused: 0,
    positionErrors: 0,
    lastAccuracy: null,
  });

  // Снимок маршрута в базу: страховка для ухода в фон и смены экрана.
  // Пустой массив не пишем никогда — именно это затирало прогулку, когда
  // из архива открывали активную экспедицию (в state путь был ещё пустым).
  const persistRoute = useCallback(
    (expeditionId = currentExpeditionId) => {
      if (!expeditionId || !canPersistRoute(routeRef.current)) {
        return;
      }

      db.expeditions
        .update(expeditionId, { path: routeRef.current })
        .catch((error) => {
          console.error("Не удалось сохранить маршрут:", error);
        });
    },
    [currentExpeditionId],
  );

  // Счётчики копятся в памяти и раз в 20 секунд уходят одной строкой в журнал,
  // чтобы не писать в IndexedDB на каждую точку GPS.
  const flushDiagnostics = useCallback(
    (force = false) => {
      const counters = countersRef.current;
      const now = Date.now();

      if (!force && now - lastFlushAtRef.current < 20000) {
        return;
      }

      const hasData = Object.entries(counters).some(
        ([key, value]) => key !== "lastAccuracy" && value > 0,
      );

      if (!hasData) {
        return;
      }

      lastFlushAtRef.current = now;
      logDiagnostic("route-stats", {
        expeditionId: currentExpeditionId,
        ...counters,
      });

      countersRef.current = {
        accepted: 0,
        droppedAccuracy: 0,
        skippedThrottle: 0,
        skippedPaused: 0,
        positionErrors: 0,
        lastAccuracy: counters.lastAccuracy,
      };
    },
    [currentExpeditionId],
  );

  // Лист находки читает ключ при открытии: после настроек ему нужна свежая версия.
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setSettingsRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    async function loadData() {
      // Тестовые строки живут только до перезапуска: читаем архив один раз,
      // попутно удаляя их, чтобы UI никогда не показывал фейковые прогулки.
      const allExpeditions = await loadExpeditionsWithoutDebug();
      setExpeditions(allExpeditions);
      setDebugCount(0);

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

  // Журнал нужен карте, чтобы объяснять причины разрывов: «экран был выключен».
  useEffect(() => {
    let isCancelled = false;

    async function loadDiagnostics() {
      const rows = await db.diagnostics
        .orderBy("id")
        .reverse()
        .limit(500)
        .toArray();

      if (!isCancelled) {
        setDiagnostics(rows.reverse());
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadDiagnostics();
      }
    }

    loadDiagnostics();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const selectExpedition = async (expedition) => {
    // Если сейчас идёт запись, сначала фиксируем её маршрут в базе: пустой
    // или устаревший state не должен попасть в сохранённую прогулку.
    persistRoute();

    // В state путь обновляется раз в 20 секунд, поэтому открываем свежую
    // запись из базы. Активную прогулку показываем в режиме записи — иначе
    // из архива нельзя вернуться к ней, а «просмотр» гасил трекинг.
    const fresh = (await db.expeditions.get(expedition.id)) ?? expedition;
    const isActive = !fresh.endTime;

    const selectedFindings = await db.findings
      .where("expeditionId")
      .equals(fresh.id)
      .toArray();

    setCurrentExpeditionId(fresh.id);
    setRoute(fresh.path || []);
    setFindings(selectedFindings);
    setIsFollowEnabled(true);
    setIsWalking(isActive);
    setIsPaused(isActive && Boolean(fresh.pausedAt));
    setView("map");

    setExpeditions((prevExpeditions) =>
      prevExpeditions.map((item) =>
        item.id === fresh.id ? { ...item, path: fresh.path ?? item.path } : item,
      ),
    );

    if (isActive) {
      lastAppendAtRef.current = 0;
      logDiagnostic("expedition-open-active", { expeditionId: fresh.id });
    }
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

      if (!isWalking) {
        return;
      }

      if (isPaused) {
        countersRef.current.skippedPaused += 1;
        return;
      }

      // Неточные точки (дома, в начале трека, в подворотне) не пишем в маршрут:
      // они дают те самые «броски» линии через полкарту. Факт отбрасывания
      // считаем, чтобы в поле понимать, сколько теряет фильтр.
      if (accuracy > MAX_ACCURACY_METERS) {
        countersRef.current.droppedAccuracy += 1;
        countersRef.current.lastAccuracy = Math.round(accuracy);
        flushDiagnostics();
        return;
      }

      // watchPosition присылает обновления чаще, чем нужен шаг маршрута.
      const now = Date.now();
      if (now - lastAppendAtRef.current < MIN_POINT_INTERVAL_MS) {
        countersRef.current.skippedThrottle += 1;
        return;
      }

      lastAppendAtRef.current = now;
      countersRef.current.accepted += 1;
      countersRef.current.lastAccuracy = Math.round(accuracy);

      const isSegmentStart = pendingBreakRef.current;
      setRoute((prevRoute) =>
        appendRoutePoint(prevRoute, coordinates, {
          isSegmentStart,
          accuracy,
        }),
      );
      flushDiagnostics();
    },
    [isWalking, isPaused, flushDiagnostics],
  );

  const startExpedition = async () => {
    // Защита от «висящей» экспедиции: если в базе уже есть незавершённая,
    // продолжаем её, а не создаём дубль (иначе в БД остаётся запись без endTime).
    const activeExpedition = expeditions.find(
      (expedition) => !expedition.endTime,
    );

    if (activeExpedition) {
      const active = (await db.expeditions.get(activeExpedition.id)) ?? activeExpedition;
      const activeFindings = await db.findings
        .where("expeditionId")
        .equals(active.id)
        .toArray();

      setCurrentExpeditionId(active.id);
      setRoute(active.path || []);
      setFindings(activeFindings);
      setIsWalking(true);
      setIsPaused(Boolean(active.pausedAt));
      setIsFollowEnabled(true);
      setIsStartModalOpen(false);
      setView("map");
      lastAppendAtRef.current = 0;
      logDiagnostic("expedition-start", {
        expeditionId: active.id,
        resumed: true,
      });
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
    lastAppendAtRef.current = 0;
    logDiagnostic("expedition-start", { expeditionId: id, resumed: false });
  };

  // Старт с карты: либо продолжаем активную экспедицию, либо заводим новую.
  const startWalk = async () => {
    const current = expeditions.find(
      (expedition) => expedition.id === currentExpeditionId,
    );

    // Продолжаем только незавершённую. Если сейчас открыт архивный маршрут,
    // «Начать» должно завести новую прогулку, а не писать точки в старую.
    if (current && !current.endTime) {
      const fresh = (await db.expeditions.get(current.id)) ?? current;
      setRoute(fresh.path || []);
      setIsWalking(true);
      setIsPaused(Boolean(fresh.pausedAt));
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
    flushDiagnostics(true);
    logDiagnostic("pause", { expeditionId: currentExpeditionId });

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
    logDiagnostic("resume-tracking", { expeditionId: currentExpeditionId });

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
    lastAppendAtRef.current = 0;
    flushDiagnostics(true);
    logDiagnostic("finish", {
      expeditionId: currentExpeditionId,
      points: route.length,
    });
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

    const fresh = (await db.expeditions.get(expeditionId)) ?? expedition;

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
    setRoute(fresh.path || []);
    setFindings(resumedFindings);
    setIsWalking(true);
    setIsPaused(false);
    setIsFollowEnabled(true);
    setIsLogOpen(false);
    setView("map");

    // Продолжение после «Остановить» — тоже разрыв, даже если прошло две минуты.
    pendingBreakRef.current = true;
    lastAppendAtRef.current = 0;
    logDiagnostic("expedition-resume", { expeditionId });
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
      // В экспедиции одна цель: новая цель снимает флаг с предыдущей,
      // иначе на карте появляются два «цель найдена» (так и вышло 22.11).
      if (isGoal && currentExpeditionId) {
        await db.findings
          .where("expeditionId")
          .equals(currentExpeditionId)
          .modify({ isGoal: false });

        const clearGoal = (item) =>
          item.isGoal ? { ...item, isGoal: false } : item;

        setFindings((prev) => prev.map(clearGoal));
        setAllFindingsInDB((prev) => prev.map(clearGoal));
      }

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

  const refreshExpeditions = async () => {
    const rows = await db.expeditions.orderBy("id").reverse().toArray();
    setExpeditions(rows);
    setDebugCount(rows.filter((expedition) => expedition.isDebug).length);
  };

  const handleSeedDebug = async () => {
    try {
      const result = await seedDebugData(25);
      await refreshExpeditions();

      if (result.added > 0) {
        notify(`Добавлено тестовых: ${result.added}`);
      } else {
        notify("Предел тестовых прогулок — 200", { tone: "error" });
      }
    } catch (error) {
      console.error("Не удалось добавить тестовые прогулки:", error);
      notify("Не удалось добавить тестовые прогулки", { tone: "error" });
    }
  };

  const handleClearDebug = async () => {
    try {
      await removeDebugData();
      await refreshExpeditions();
      notify("Тестовые прогулки удалены");
    } catch (error) {
      console.error("Не удалось удалить тестовые прогулки:", error);
      notify("Не удалось удалить тестовые прогулки", { tone: "error" });
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
    if (!canPersistRoute(route) || !currentExpeditionId) {
      return;
    }

    if (Date.now() - lastRouteSaveRef.current < ROUTE_SAVE_INTERVAL_MS) {
      return;
    }

    lastRouteSaveRef.current = Date.now();

    db.expeditions
      .update(currentExpeditionId, { path: route })
      .catch((error) => {
        console.error("Не удалось сохранить маршрут:", error);
      });

    // Архив и отчёт берут путь из этого state — держим его свежим, иначе
    // открытая из архива активная прогулка показывалась без линии.
    setExpeditions((prevExpeditions) =>
      prevExpeditions.map((expedition) =>
        expedition.id === currentExpeditionId
          ? { ...expedition, path: route }
          : expedition,
      ),
    );
  }, [route, currentExpeditionId]);

  // Страховка: при уходе страницы в фон или закрытии вкладки сохраняем маршрут
  // принудительно, не дожидаясь окна троттлинга.
  useEffect(() => {
    if (!currentExpeditionId) {
      return;
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
  }, [currentExpeditionId, persistRoute]);

  useEffect(() => {
    if (!navigator.geolocation) {
      notify("Браузер не поддерживает геолокацию", { tone: "error" });
      return;
    }

    // Ошибки watchPosition могут идти пачкой (нет сигнала в метро) — не спамим.
    let lastErrorNotifyAt = 0;

    const handleError = (error) => {
      countersRef.current.positionErrors += 1;
      logDiagnostic("position-error", {
        expeditionId: currentExpeditionId,
        code: error.code,
        message: error.message,
      });

      const now = Date.now();
      if (now - lastErrorNotifyAt > 30000) {
        lastErrorNotifyAt = now;
        notify(`Не получили координаты: ${error.message}`, { tone: "error" });
      }
    };

    if (!isWalking || isPaused) {
      navigator.geolocation.getCurrentPosition(updatePosition, handleError, {
        enableHighAccuracy: true,
      });
      return;
    }

    // watchPosition вместо таймера: система сама присылает обновления и лучше
    // переживает уход страницы в фон, чем setInterval.
    logDiagnostic("watch-start", { expeditionId: currentExpeditionId });

    const watchId = navigator.geolocation.watchPosition(
      updatePosition,
      handleError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      flushDiagnostics(true);
      logDiagnostic("watch-stop", { expeditionId: currentExpeditionId });
    };
  }, [
    isWalking,
    isPaused,
    updatePosition,
    notify,
    flushDiagnostics,
    currentExpeditionId,
  ]);

  // Журнал фона: по нему видно, когда страница уходила в фон и возвращалась.
  useEffect(() => {
    const handleVisibility = () =>
      logDiagnostic("visibility", { state: document.visibilityState });
    const handlePageHide = () => {
      flushDiagnostics(true);
      logDiagnostic("pagehide", {});
    };
    const handlePageShow = () => logDiagnostic("pageshow", {});
    const handleFreeze = () => logDiagnostic("freeze", {});
    const handleResume = () => logDiagnostic("resume", {});

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("freeze", handleFreeze);
    document.addEventListener("resume", handleResume);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("freeze", handleFreeze);
      document.removeEventListener("resume", handleResume);
    };
  }, [flushDiagnostics]);

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
            diagnostics={diagnostics}
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
        debugCount={debugCount}
        onSeedDebug={handleSeedDebug}
        onClearDebug={handleClearDebug}
      />
    </div>
  );
}

export default App;
