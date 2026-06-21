import { useEffect, useMemo, useRef, useState } from "react";

import {
  getDashboardSummary,
  getEvent,
  getEvents,
  getMe,
  getStations,
  login,
  patchEventConfirmation,
  patchEventStatus
} from "./api";

const demoCredentials = {
  email: import.meta.env.VITE_DEMO_EMAIL || "",
  password: import.meta.env.VITE_DEMO_PASSWORD || ""
};

const AUTO_REFRESH_MS = 5000;
const DEFAULT_HISTORY_PAGE_SIZE = 200;
const HISTORY_PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

function fmtDateTime(value) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fmtTime(value) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sourceBadge(source) {
  return <span className={`badge ${source === "cv" ? "b-cv" : "b-ai"}`}>{source.toUpperCase()}</span>;
}

function severityBadge(severity) {
  return <span className={`badge s-${severity}`}>{severity.toUpperCase()}</span>;
}

function statusLabel(status) {
  const labels = {
    open: "Открыт",
    in_work: "В работе",
    resolved: "Решён",
    false_alarm: "Ложное"
  };

  return labels[status] || status;
}

function statusBadge(status) {
  return <span className={`badge status-pill status-${status}`}>{statusLabel(status)}</span>;
}

function confirmationLabel(value) {
  if (value === true) {
    return "Событие произошло";
  }
  if (value === false) {
    return "Событие не произошло";
  }
  return "Не размечено";
}

function confirmationBadge(value) {
  const cls = value === true ? "confirmed-yes" : value === false ? "confirmed-no" : "confirmed-empty";
  return <span className={`badge confirmation-pill ${cls}`}>{confirmationLabel(value)}</span>;
}

function isPreviewableUrl(value) {
  return typeof value === "string" && /^(https?:|data:|blob:)/i.test(value);
}

function mediaLink(url, label = "Открыть файл") {
  if (!isPreviewableUrl(url)) {
    return null;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="media-link">
      {label}
    </a>
  );
}

function mediaPlaceholder(kind, hasUrl = false) {
  const labels = {
    image: hasUrl ? "Изображение недоступно" : "Ожидаем изображение",
    clip: hasUrl ? "Клип недоступен" : "Ожидаем клип"
  };

  return <div className="media-placeholder">{labels[kind] || "Файл недоступен"}</div>;
}

function renderMediaPreview(kind, url, title) {
  if (!url) {
    return mediaPlaceholder(kind, false);
  }

  if (!isPreviewableUrl(url)) {
    return mediaPlaceholder(kind, true);
  }

  if (kind === "image") {
    return <img className="media-preview" src={url} alt={title} loading="lazy" />;
  }

  if (kind === "clip") {
    return <video className="media-preview" src={url} controls preload="metadata" playsInline />;
  }

  return mediaLink(url);
}

function normalizeEventsResponse(data) {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      limit: data.length,
      offset: 0
    };
  }
  return data;
}

function mediaDisplayItems(media = []) {
  const imageItems = media.filter((item) => item.kind === "image");
  const clipItems = media.filter((item) => item.kind === "clip");
  const otherItems = media.filter((item) => item.kind !== "image" && item.kind !== "clip");

  return [
    ...imageItems.map((item, index) => ({
      ...item,
      label: index === 0 ? "Изображение с разметкой" : `Изображение ${index + 1}`,
      description: "Кадр с нанесенной разметкой события"
    })),
    ...clipItems.map((item, index) => ({
      ...item,
      label: index === 0 ? "Клип без разметки" : index === 1 ? "Клип с разметкой" : `Клип ${index + 1}`,
      description: index === 0 ? "Исходный фрагмент для проверки сценария" : "Фрагмент с визуальной разметкой"
    })),
    ...otherItems.map((item, index) => ({
      ...item,
      label: `Файл ${index + 1}`,
      description: item.kind
    }))
  ];
}

export default function App() {
  const mainRef = useRef(null);
  const returnContextRef = useRef({ page: "history", scrollTop: 0 });
  const pageRef = useRef("dashboard");
  const selectedEventIdRef = useRef(null);
  const eventRequestRef = useRef(0);
  const eventOpenLockedRef = useRef(false);
  const navigationEventsRef = useRef([]);
  const [token, setToken] = useState(() => localStorage.getItem("gv_token"));
  const [user, setUser] = useState(null);
  const [stations, setStations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboardEvents, setDashboardEvents] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_HISTORY_PAGE_SIZE);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(false);
  const [loginForm, setLoginForm] = useState(demoCredentials);
  const [loginError, setLoginError] = useState("");
  const [historyFilters, setHistoryFilters] = useState({
    source: "",
    severity: "",
    station_code: "",
    event_confirmed: "",
    search: ""
  });
  const [dashboardFilters, setDashboardFilters] = useState({
    source: "",
    severity: "",
    search: ""
  });
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState("online");

  function markOnline() {
    setConnectionState("online");
  }

  function handleRequestError(error) {
    if (error?.message === "auth") {
      localStorage.removeItem("gv_token");
      setToken(null);
      return;
    }

    setConnectionState("offline");
  }

  async function loadBootstrapData() {
    const [me, stationsData, summaryData, eventsData] = await Promise.all([
      getMe(),
      getStations(),
      getDashboardSummary(),
      getEvents()
    ]);

    setUser(me);
    setStations(stationsData);
    setSummary(summaryData);
    const events = normalizeEventsResponse(eventsData);
    setDashboardEvents(events.items.slice(0, 15));
    setHistoryEvents(events.items);
    setHistoryTotal(events.total);
    markOnline();
  }

  async function refreshDashboardData() {
    const [summaryData, eventsData] = await Promise.all([
      getDashboardSummary(),
      getEvents({ ...dashboardFilters, limit: 15, offset: 0 })
    ]);

    setSummary(summaryData);
    setDashboardEvents(normalizeEventsResponse(eventsData).items.slice(0, 15));
    markOnline();
  }

  async function refreshHistoryData() {
    const data = await getEvents({
      ...historyFilters,
      limit: historyPageSize,
      offset: (historyPage - 1) * historyPageSize
    });
    const events = normalizeEventsResponse(data);
    setHistoryEvents(events.items);
    setHistoryTotal(events.total);
    markOnline();
  }

  async function refreshSelectedEvent(eventId) {
    if (!eventId || pageRef.current !== "event" || selectedEventIdRef.current !== eventId) {
      return;
    }

    const requestId = eventRequestRef.current;
    const data = await getEvent(eventId);
    if (pageRef.current !== "event" || selectedEventIdRef.current !== eventId || eventRequestRef.current !== requestId) {
      return;
    }
    setSelectedEvent(data);
    markOnline();
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    async function boot() {
      try {
        setLoading(true);
        await loadBootstrapData();
      } catch (error) {
        handleRequestError(error);
      } finally {
        setLoading(false);
      }
    }

    boot();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    refreshHistoryData().catch(() => {});
  }, [token, historyFilters, historyPage, historyPageSize]);

  useEffect(() => {
    if (!token) {
      return;
    }

    refreshDashboardData().catch(() => {});
  }, [token, dashboardFilters]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isStopped = false;

    async function refreshAll() {
      try {
        const tasks = [refreshDashboardData(), refreshHistoryData()];
        if (page === "event" && selectedEvent?.id) {
          tasks.push(refreshSelectedEvent(selectedEvent.id));
        }
        await Promise.all(tasks);
      } catch (error) {
        if (isStopped) {
          return;
        }
        handleRequestError(error);
      }
    }

    refreshAll().catch(() => {});

    const intervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      refreshAll().catch(() => {});
    }, AUTO_REFRESH_MS);

    return () => {
      isStopped = true;
      window.clearInterval(intervalId);
    };
  }, [token, dashboardFilters, historyFilters, historyPage, historyPageSize, page, selectedEvent?.id]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const stationOptions = useMemo(
    () => stations.map((station) => ({ value: station.station_code, label: station.name })),
    [stations]
  );

  const historyPageCount = Math.max(1, Math.ceil(historyTotal / historyPageSize));
  const historyStart = historyTotal ? (historyPage - 1) * historyPageSize + 1 : 0;
  const historyEnd = Math.min(historyPage * historyPageSize, historyTotal);
  const selectedMediaItems = selectedEvent ? mediaDisplayItems(selectedEvent.media) : [];
  const navigationEvents = navigationEventsRef.current;
  const selectedEventIndex = selectedEvent ? navigationEvents.findIndex((event) => event.id === selectedEvent.id) : -1;
  const hasPreviousEvent = selectedEventIndex > 0;
  const hasNextEvent = selectedEventIndex >= 0 && selectedEventIndex < navigationEvents.length - 1;

  useEffect(() => {
    setHistoryPage(1);
  }, [historyFilters, historyPageSize]);

  async function handleLogin(event) {
    event.preventDefault();
    try {
      setLoginError("");
      const data = await login(loginForm.email, loginForm.password);
      localStorage.setItem("gv_token", data.access_token);
      setToken(data.access_token);
      markOnline();
    } catch (error) {
      handleRequestError(error);
      setLoginError("Не удалось войти. Проверьте email и пароль.");
    }
  }

  async function openEvent(id, nextPage = "event", sourcePage = page) {
    if (eventOpenLockedRef.current || pageRef.current === "event") {
      return;
    }

    eventOpenLockedRef.current = true;
    selectedEventIdRef.current = id;
    const requestId = eventRequestRef.current + 1;
    eventRequestRef.current = requestId;
    returnContextRef.current = {
      page: sourcePage,
      scrollTop: mainRef.current?.scrollTop || 0
    };
    navigationEventsRef.current = sourcePage === "dashboard" ? dashboardEvents : historyEvents;
    try {
      const data = await getEvent(id);
      if (eventRequestRef.current !== requestId || selectedEventIdRef.current !== id) {
        return;
      }
      setSelectedEvent(data);
      setPage(nextPage);
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      markOnline();
    } catch (error) {
      eventOpenLockedRef.current = false;
      selectedEventIdRef.current = null;
      handleRequestError(error);
    }
  }

  function returnFromEvent() {
    const context = returnContextRef.current || { page: "history", scrollTop: 0 };
    eventOpenLockedRef.current = false;
    selectedEventIdRef.current = null;
    eventRequestRef.current += 1;
    setSelectedEvent(null);
    setPage(context.page || "history");
    window.setTimeout(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = context.scrollTop || 0;
      }
    }, 0);
  }

  async function handleStatusChange(status) {
    if (!selectedEvent) {
      return;
    }
    const updated = await patchEventStatus(selectedEvent.id, status);
    setSelectedEvent(updated);
    setDashboardEvents((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setHistoryEvents((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    markOnline();
  }

  async function handleConfirmationChange(value) {
    if (!selectedEvent) {
      return;
    }
    const updated = await patchEventConfirmation(selectedEvent.id, value);
    setSelectedEvent(updated);
    setDashboardEvents((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setHistoryEvents((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    markOnline();
  }

  async function openAdjacentEvent(direction) {
    const targetIndex = selectedEventIndex + direction;
    const targetEvent = navigationEvents[targetIndex];
    if (!targetEvent) {
      return;
    }

    selectedEventIdRef.current = targetEvent.id;
    const requestId = eventRequestRef.current + 1;
    eventRequestRef.current = requestId;
    try {
      const data = await getEvent(targetEvent.id);
      if (eventRequestRef.current !== requestId || selectedEventIdRef.current !== targetEvent.id) {
        return;
      }
      setSelectedEvent(data);
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      markOnline();
    } catch (error) {
      handleRequestError(error);
    }
  }

  function goToHistoryPage(nextPage) {
    const safePage = Math.min(Math.max(nextPage, 1), historyPageCount);
    setHistoryPage(safePage);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }

  function renderPagination(position) {
    if (historyTotal <= historyPageSize) {
      return null;
    }

    return (
      <div className={`pagination pagination-${position}`}>
        <button
          className="btn secondary pager-btn pager-arrow"
          onClick={() => goToHistoryPage(historyPage - 1)}
          disabled={historyPage === 1}
          aria-label="Предыдущая страница"
        >
          ‹
        </button>
        <div className="pager-meta">
          <span className="pager-page">{historyPage} / {historyPageCount}</span>
          <span>{historyStart}-{historyEnd} из {historyTotal}</span>
        </div>
        <button
          className="btn secondary pager-btn pager-arrow"
          onClick={() => goToHistoryPage(historyPage + 1)}
          disabled={historyPage >= historyPageCount}
          aria-label="Следующая страница"
        >
          ›
        </button>
      </div>
    );
  }

  function navigate(nextPage) {
    if (nextPage !== "event") {
      eventOpenLockedRef.current = false;
      selectedEventIdRef.current = null;
      eventRequestRef.current += 1;
      setSelectedEvent(null);
    }
    setPage(nextPage);
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }

  function logout() {
    localStorage.removeItem("gv_token");
    setToken(null);
    setUser(null);
    setSelectedEvent(null);
    setPage("dashboard");
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand">
            <div className="logo">GV</div>
            <div className="brand-copy">
              <span className="eyebrow">Dispatcher Platform</span>
              <h1>gasvision.ru — Панель диспетчера</h1>
            </div>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <div className="field">
              <label>Email</label>
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm((state) => ({ ...state, email: event.target.value }))}
                placeholder="Введите email"
              />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((state) => ({ ...state, password: event.target.value }))}
                placeholder="Введите пароль"
              />
            </div>
            <div className="row">
              <button className="btn" type="submit" style={{ flex: 1 }}>
                Войти
              </button>
              <button className="btn secondary" type="button" onClick={() => setLoginForm(demoCredentials)}>
                Демо
              </button>
            </div>
            {loginError ? <div className="error shown">{loginError}</div> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app shown">
      <header className="app-header">
        <div className="hdr-left">
          <div className="logo small">GV</div>
          <div>
            <div className="hdr-title">GasVision</div>
          </div>
        </div>
        <div className="hdr-right">
          <div
            className={`connection-indicator ${connectionState}`}
            aria-label={connectionState === "online" ? "Онлайн" : "Оффлайн"}
          >
            <span className="connection-dot" />
            <span className="connection-tooltip">{connectionState === "online" ? "Онлайн" : "Оффлайн"}</span>
          </div>
          <div className="pill">
            <span>Диспетчер:</span>
            <b>{user?.full_name}</b>
          </div>
          <button className="link-btn" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Основная навигация">
        <button className={`mobile-nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => navigate("dashboard")}>
          Дашборд
        </button>
        <button className={`mobile-nav-item ${page === "history" ? "active" : ""}`} onClick={() => navigate("history")}>
          История
        </button>
        <button className={`mobile-nav-item ${page === "stations" ? "active" : ""}`} onClick={() => navigate("stations")}>
          Станции
        </button>
      </nav>

      <div className="layout">
        <aside className="sidebar">
          <div className={`nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => navigate("dashboard")}>
            <span>Дашборд</span>
            <span className="nav-badge">{dashboardEvents.length}</span>
          </div>
          <div className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => navigate("history")}>
            <span>История</span>
            <span className="nav-badge">{historyTotal}</span>
          </div>
          <div className={`nav-item ${page === "stations" ? "active" : ""}`} onClick={() => navigate("stations")}>
            <span>Станции</span>
            <span className="nav-badge">{stations.length}</span>
          </div>
        </aside>

        <main className="main" ref={mainRef}>
          {loading ? <div className="card card-body">Загружаю данные...</div> : null}

          {page === "dashboard" ? (
            <section className="page active">
              <div className="kpi-row">
                <div className="kpi">
                  <div className="label">Событий за 24 часа</div>
                  <div className="value">{summary?.events_24h ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="label">CV за 24 часа</div>
                  <div className="value">{summary?.cv_24h ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="label">AI за 24 часа</div>
                  <div className="value">{summary?.ai_24h ?? 0}</div>
                </div>
                <div className="kpi">
                  <div className="label">Высокая критичность</div>
                  <div className="value">{summary?.high_24h ?? 0}</div>
                </div>
              </div>

              <div className="card table-card">
                <div className="card-header">
                  <h2>Список событий</h2>
                  <div className="meta">Последние 15 событий</div>
                </div>
                <div className="card-body toolbar">
                  <input
                    placeholder="Поиск"
                    value={dashboardFilters.search}
                    onChange={(event) => setDashboardFilters((state) => ({ ...state, search: event.target.value }))}
                  />
                  <select
                    value={dashboardFilters.source}
                    onChange={(event) => setDashboardFilters((state) => ({ ...state, source: event.target.value }))}
                  >
                    <option value="">Все типы</option>
                    <option value="cv">CV</option>
                    <option value="ai">AI</option>
                  </select>
                  <select
                    value={dashboardFilters.severity}
                    onChange={(event) => setDashboardFilters((state) => ({ ...state, severity: event.target.value }))}
                  >
                    <option value="">Любая критичность</option>
                    <option value="high">HIGH</option>
                    <option value="med">MED</option>
                    <option value="low">LOW</option>
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Время</th>
                        <th>Тип</th>
                        <th>Описание</th>
                        <th>Станция</th>
                        <th>Критичность</th>
                        <th>Статус</th>
                        <th className="confirmation-cell">Разметка</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardEvents.length ? (
                        dashboardEvents.map((event) => (
                          <tr key={event.id} className="clickable table-row" onClick={() => openEvent(event.id, "event", "dashboard")}>
                            <td>{fmtTime(event.created_at)}</td>
                            <td>{sourceBadge(event.source)}</td>
                            <td>{event.title}</td>
                            <td>{event.station_name}</td>
                            <td>{severityBadge(event.severity)}</td>
                            <td>{statusBadge(event.status)}</td>
                            <td className="confirmation-cell">{confirmationBadge(event.event_confirmed)}</td>
                            <td className="row-action">→</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8" className="empty-cell">
                            События не найдены
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          {page === "history" ? (
            <section className="page active">
              <div className="card table-card">
                <div className="card-header">
                  <h2>История событий</h2>
                  <div className="meta">{historyTotal ? `${historyStart}-${historyEnd} из ${historyTotal}` : "События не найдены"}</div>
                </div>
                <button className="filters-toggle" onClick={() => setHistoryFiltersOpen((value) => !value)}>
                  {historyFiltersOpen ? "Скрыть фильтры" : "Фильтры"}
                </button>
                <div className={`card-body toolbar filters-panel ${historyFiltersOpen ? "open" : ""}`}>
                  <input
                    placeholder="Поиск"
                    value={historyFilters.search}
                    onChange={(event) => setHistoryFilters((state) => ({ ...state, search: event.target.value }))}
                  />
                  <select
                    value={historyFilters.source}
                    onChange={(event) => setHistoryFilters((state) => ({ ...state, source: event.target.value }))}
                  >
                    <option value="">Все типы</option>
                    <option value="cv">CV</option>
                    <option value="ai">AI</option>
                  </select>
                  <select
                    value={historyFilters.station_code}
                    onChange={(event) => setHistoryFilters((state) => ({ ...state, station_code: event.target.value }))}
                  >
                    <option value="">Все станции</option>
                    {stationOptions.map((station) => (
                      <option key={station.value} value={station.value}>
                        {station.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={historyFilters.severity}
                    onChange={(event) => setHistoryFilters((state) => ({ ...state, severity: event.target.value }))}
                  >
                    <option value="">Любая критичность</option>
                    <option value="high">HIGH</option>
                    <option value="med">MED</option>
                    <option value="low">LOW</option>
                  </select>
                  <select
                    value={historyFilters.event_confirmed}
                    onChange={(event) => setHistoryFilters((state) => ({ ...state, event_confirmed: event.target.value }))}
                  >
                    <option value="">Любая разметка</option>
                    <option value="unmarked">Не размечено</option>
                    <option value="true">Событие произошло</option>
                    <option value="false">Событие не произошло</option>
                  </select>
                  <select
                    className="page-size-select"
                    value={historyPageSize}
                    onChange={(event) => setHistoryPageSize(Number(event.target.value))}
                  >
                    {HISTORY_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} на странице
                      </option>
                    ))}
                  </select>
                </div>
                {renderPagination("top")}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Дата/время</th>
                        <th>Тип</th>
                        <th>Описание</th>
                        <th>Станция</th>
                        <th>Критичность</th>
                        <th>Статус</th>
                        <th className="confirmation-cell">Разметка</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {historyEvents.length ? (
                        historyEvents.map((event) => (
                          <tr key={event.id} className="clickable table-row" onClick={() => openEvent(event.id, "event", "history")}>
                            <td>{fmtDateTime(event.created_at)}</td>
                            <td>{sourceBadge(event.source)}</td>
                            <td>{event.title}</td>
                            <td>{event.station_name}</td>
                            <td>{severityBadge(event.severity)}</td>
                            <td>{statusBadge(event.status)}</td>
                            <td className="confirmation-cell">{confirmationBadge(event.event_confirmed)}</td>
                            <td className="row-action">→</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8" className="empty-cell">
                            События не найдены
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {renderPagination("bottom")}
              </div>
            </section>
          ) : null}

          {page === "stations" ? (
            <section className="page active">
              <div className="card">
                <div className="card-header">
                  <h2>Подключенные станции</h2>
                  <div className="meta">{stations.length} доступно пользователю</div>
                </div>
                <div className="stations-grid">
                  {stations.map((station) => (
                    <div className="station" key={station.id}>
                      <div className="top">
                        <h3>{station.name}</h3>
                        <span className={`badge station-status ${station.status}`}>{station.status.toUpperCase()}</span>
                      </div>
                      <div className="loc">{station.location}</div>
                      <div className="rows">
                        <div>
                          <span className="muted">Код станции:</span> {station.station_code}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {page === "event" && selectedEvent ? (
            <section className="page active event-page">
              <div className="crumbs">
                <button onClick={returnFromEvent}>← Назад</button>
                <span>/</span>
                <span>{selectedEvent.id}</span>
              </div>
              <div className="detail-grid">
                <div className="detail-left">
                  <div className="card event-main-card">
                    <div className="card-header">
                      <div>
                        <h2>{selectedEvent.title}</h2>
                      </div>
                      <div className="meta">{fmtDateTime(selectedEvent.created_at)}</div>
                    </div>
                    <div className="card-body">
                      <div className="kv">
                        <div className="k">ID события</div>
                        <div>{selectedEvent.id}</div>
                        <div className="k">Тип</div>
                        <div>{sourceBadge(selectedEvent.source)}</div>
                        <div className="k">Критичность</div>
                        <div>{severityBadge(selectedEvent.severity)}</div>
                        <div className="k">Станция</div>
                        <div>{selectedEvent.station_name}</div>
                        <div className="k">Камера</div>
                        <div>{selectedEvent.camera_code || "—"}</div>
                        <div className="k">Статус</div>
                        <div>{statusBadge(selectedEvent.status)}</div>
                        <div className="k">Разметка</div>
                        <div>{confirmationBadge(selectedEvent.event_confirmed)}</div>
                        <div className="k">Последний оператор</div>
                        <div>{selectedEvent.last_status_changed_by_name || "Статус ещё не меняли"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <h2>Медиа</h2>
                      <div className="meta">{selectedEvent.media.length} файлов</div>
                    </div>
                    <div className="card-body">
                      {selectedMediaItems.length ? (
                        <div className="media-grid media-grid-detail">
                          {selectedMediaItems.map((item, index) => (
                            <div key={`${item.kind}-${item.id || index}-${item.s3_url}`} className="media-item">
                              <div className="media-item-head">
                                <div>
                                  <div className="media-kind">{item.label}</div>
                                  <div className="media-description">{item.description}</div>
                                </div>
                                {mediaLink(item.s3_url, "Открыть")}
                              </div>
                              {renderMediaPreview(item.kind, item.s3_url, `${selectedEvent.title} ${item.label}`)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state">Медиа пока не прикреплены.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="detail-right">
                  <div className="card label-card">
                    <div className="card-header">
                      <h2>Разметка события</h2>
                    </div>
                    <div className="card-body action-row action-grid">
                      <button
                        className={`btn secondary confirm-btn confirm-yes ${selectedEvent.event_confirmed === true ? "active" : ""}`}
                        onClick={() => handleConfirmationChange(true)}
                      >
                        Событие произошло
                      </button>
                      <button
                        className={`btn secondary confirm-btn confirm-no ${selectedEvent.event_confirmed === false ? "active" : ""}`}
                        onClick={() => handleConfirmationChange(false)}
                      >
                        Событие не произошло
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-body event-nav-actions">
                      <button
                        className="btn secondary event-nav-btn"
                        onClick={() => openAdjacentEvent(-1)}
                        disabled={!hasPreviousEvent}
                        aria-label="Предыдущее событие"
                      >
                        ‹
                      </button>
                      <button
                        className="btn secondary event-nav-btn"
                        onClick={() => openAdjacentEvent(1)}
                        disabled={!hasNextEvent}
                        aria-label="Следующее событие"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <h2>Смена статуса</h2>
                    </div>
                    <div className="card-body action-row action-grid">
                      <button
                        className={`btn secondary status-btn ${selectedEvent.status === "open" ? "active" : ""}`}
                        onClick={() => handleStatusChange("open")}
                      >
                        Открыт
                      </button>
                      <button
                        className={`btn secondary status-btn ${selectedEvent.status === "in_work" ? "active" : ""}`}
                        onClick={() => handleStatusChange("in_work")}
                      >
                        В работе
                      </button>
                      <button
                        className={`btn secondary status-btn ${selectedEvent.status === "resolved" ? "active" : ""}`}
                        onClick={() => handleStatusChange("resolved")}
                      >
                        Решён
                      </button>
                      <button
                        className={`btn secondary status-btn ${selectedEvent.status === "false_alarm" ? "active" : ""}`}
                        onClick={() => handleStatusChange("false_alarm")}
                      >
                        Ложное
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mobile-sticky-actions">
                <button
                  className="btn secondary event-nav-btn"
                  onClick={() => openAdjacentEvent(-1)}
                  disabled={!hasPreviousEvent}
                  aria-label="Предыдущее событие"
                >
                  ‹
                </button>
                <button
                  className={`btn secondary confirm-btn confirm-yes ${selectedEvent.event_confirmed === true ? "active" : ""}`}
                  onClick={() => handleConfirmationChange(true)}
                >
                  Произошло
                </button>
                <button
                  className={`btn secondary confirm-btn confirm-no ${selectedEvent.event_confirmed === false ? "active" : ""}`}
                  onClick={() => handleConfirmationChange(false)}
                >
                  Не произошло
                </button>
                <button
                  className="btn secondary event-nav-btn"
                  onClick={() => openAdjacentEvent(1)}
                  disabled={!hasNextEvent}
                  aria-label="Следующее событие"
                >
                  ›
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
