import Archive from "./components/Archive";
import MapView from "./components/MapView";
import FindingModal from "./components/FindingModal";
import FindingsLog from "./components/FindingsLog";
import StartExpeditionModal from "./components/StartExpeditionModal";
import SummaryView from "./components/SummaryView";

import "./App.css";
import { useState, useEffect, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { db, clearAllData } from "./db";

function App() {
  const [position, setPosition] = useState(null);
  const [isWalking, setIsWalking] = useState(false);
  const [route, setRoute] = useState([]);
  const [findings, setFindings] = useState([]);
  const [allFindingsInDB, setAllFindingsInDB] = useState([]);
  const [currentExpeditionId, setCurrentExpeditionId] = useState(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isAddingFinding, setIsAddingFinding] = useState(false);
  const [findingNote, setFindingNote] = useState("");
  const [view, setView] = useState("archive");
  const [expeditions, setExpeditions] = useState([]);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [expeditionTitle, setExpeditionTitle] = useState("");
  const [expeditionGoal, setExpeditionGoal] = useState("");
  const [findingImage, setFindingImage] = useState(null);
  const [isGoal, setIsGoal] = useState(false);
  const [summaryExpeditionId, setSummaryExpeditionId] = useState(null);

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
      const newPoint = [pos.coords.latitude, pos.coords.longitude];
      setPosition(newPoint);

      if (isWalking) {
        setRoute((prevRoute) => [...prevRoute, newPoint]);
      }
    },
    [isWalking],
  );

  const startExpedition = async () => {
    const id = await db.expeditions.add({
      startTime: new Date(),
      path: [],
      title: expeditionTitle || "Без названия",
      goal: expeditionGoal || "Исследование",
    });

    setCurrentExpeditionId(id);
    setRoute([]);
    setIsWalking(true);
    setIsStartModalOpen(false);
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
        await db.expeditions.update(currentExpeditionId, {
          endTime: new Date(),
        });
      }
      setIsWalking(false);
      setCurrentExpeditionId(null);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFindingImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const addFinding = async () => {
    if (!position) {
      alert("Сначала нужно определить ваше местоположение");
      return;
    }
    setFindingNote("");
    setIsAddingFinding(true);
  };

  const saveFinding = async () => {
    if (!findingNote.trim()) {
      alert("Пожалуйста, напишите что-то");
      return;
    }

    const newFinding = {
      position: position,
      timeStamp: new Date(),
      note: findingNote,
      expeditionId: currentExpeditionId,
      image: findingImage,
      isGoal: isGoal,
    };

    try {
      await db.findings.add(newFinding);
      setFindings((prev) => [...prev, newFinding]);
      setAllFindingsInDB((prev) => [...prev, newFinding]);

      // СБРОС состояний после сохранения
      setIsAddingFinding(false);
      setFindingNote("");
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

  useEffect(() => {
    if (route.length === 0 || !currentExpeditionId) {
      return;
    }
    async function saveRouteToDB() {
      await db.expeditions.update(currentExpeditionId, { path: route });
    }
    saveRouteToDB();
  }, [route, currentExpeditionId]);

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
    <div className="map-container">
      {view === "archive" ? (
        <Archive
          expeditions={expeditions}
          allFindings={allFindingsInDB}
          onSelect={selectExpedition}
          onStart={() => setIsStartModalOpen(true)}
          onDeleteExpedition={deleteExpedition}
          onHardReset={handleHardReset}
          onOpenSummary={openSummary} // <-- Передаем функцию открытия отчета
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
        <>
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
            goBackToArchive={() => setView("archive")}
          />

          <FindingsLog
            isOpen={isLogOpen}
            findings={findings}
            onClose={() => setIsLogOpen(false)}
            onDeleteFinding={deleteFinding}
          />
        </>
      )}

      <FindingModal
        isOpen={isAddingFinding}
        note={findingNote}
        setNote={setFindingNote}
        onSave={saveFinding}
        onClose={() => setIsAddingFinding(false)}
        image={findingImage}
        onImageChange={handleImageChange}
        isGoal={isGoal}
        setIsGoal={setIsGoal}
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
    </div>
  );
}

export default App;
