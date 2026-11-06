# Дневник исследователя

Приватное PWA для записи прогулок и сбора «находок»: маршрут по GPS, фото с заметкой и координатами, цель прогулки и отчёт после неё. **Все данные хранятся локально в браузере (IndexedDB)** — ни аккаунтов, ни сервера, ни отправки фото куда-либо.

## Что умеет

- **Архив** прогулок с превью, счётчиком находок и переходом в отчёт.
- **Карта** (Leaflet + OpenStreetMap): трекинг позиции каждые 5 сек, линия маршрута, фото-маркеры в кластерах со spiderfy, отдельный золотой маркер для попадания в цель.
- **Находки**: фото с камеры (`capture="environment"`), сжатие до 1200px/JPEG 0.7 перед записью в БД, заметка, отметка «это была моя цель», журнал находок выезжающей панелью.
- **Отчёт**: длительность, дистанция (haversine с фильтром GPS-аномалий), средняя скорость, достигнута ли цель, лента находок.
- **Надёжность**: восстановление незавершённой прогулки после закрытия вкладки, экспорт/импорт всей базы в JSON, hard reset.
- **PWA**: манифест, standalone-режим, иконки 192/512, мета-теги для iOS.

## Стек

React 19, Vite 8, Dexie 4 (IndexedDB), Leaflet 1.9 + react-leaflet 5 + leaflet.markercluster. Стили — обычный CSS (`src/App.css`). Деплой — GitHub Pages (`gh-pages`).

## Запуск

```bash
npm install
npm run dev      # http://localhost:5173/researcher-diary/
npm run lint
npm run build    # dist/
npm run deploy   # публикация на GitHub Pages
```

Геолокация работает только на `localhost` или HTTPS. В `vite.config.js` `base` должен совпадать с именем репозитория (`/researcher-diary/`).

## Структура

```
src/
  App.jsx                  контроллер режимов (archive/map/summary), сессия, импорт/экспорт
  db.js                    Dexie: схема, бэкап, транзакционный импорт
  utils.js                 haversine, дистанция/скорость, сжатие изображений
  components/
    Archive.jsx            список экспедиций
    MapView.jsx            карта, маршрут, маркеры, кнопки управления
    FindingModal.jsx       фиксация находки
    FindingsLog.jsx        журнал находок
    StartExpeditionModal.jsx  старт прогулки
    SummaryView.jsx        отчёт
public/                    манифест, иконки
```

## Данные

Dexie `ExplorerDB`:

- `expeditions`: `++id, startTime, endTime, title, goal, path`
- `findings`: `++id, expeditionId, position, timeStamp, note, image (base64), isGoal`

Экспорт — один JSON-файл со всеми экспедициями и находками (включая фото).

## Документация

- `PROJECT_CONTEXT.md` — замысел, первичное ТЗ, архитектура, план.
- `AGENT-RULES.md` — правила работы с проектом, известные проблемы, журнал решений.

