import { useEffect, useMemo, useState } from "react";

import {
  getDashboardSummary,
  getEvent,
  getEvents,
  getMe,
  getStations,
  login,
  patchEventStatus
} from "./api";

const demoCredentials = {
  email: import.meta.env.VITE_DEMO_EMAIL || "",
  password: import.meta.env.VITE_DEMO_PASSWORD || ""
};

const AUTO_REFRESH_MS = 5000;

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

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("gv_token"));
  const [user, setUser] = useState(null);
  const [stations, setStations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboardEvents, setDashboardEvents] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [loginForm, setLoginForm] = useState(demoCredentials);
  const [loginError, setLoginError] = useState("");
  const [historyFilters, setHistoryFilters] = useState({
    source: "",
    severity: "",
    station_code: "",
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
    setDashboardEvents(eventsData.slice(0, 15));
    setHistoryEvents(eventsData);
    markOnline();
  }

  async function refreshDashboardData() {
    const [summaryData, eventsData] = await Promise.all([
      getDashboardSummary(),
      getEvents(dashboardFilters)
    ]);

    setSummary(summaryData);
    setDashboardEvents(eventsData.slice(0, 15));
    markOnline();
  }

  async function refreshHistoryData() {
    const data = await getEvents(historyFilters);
    setHistoryEvents(data);
    markOnline();
  }

  async function refreshSelectedEvent() {
    if (!selectedEvent) {
      return;
    }

    const data = await getEvent(selectedEvent.id);
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
  }, [token, historyFilters]);

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
        if (selectedEvent) {
          tasks.push(refreshSelectedEvent());
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
  }, [token, dashboardFilters, historyFilters, selectedEvent?.id]);

  const stationOptions = useMemo(
    () => stations.map((station) => ({ value: station.station_code, label: station.name })),
    [stations]
  );

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

  async function openEvent(id, nextPage) {
    const data = await getEvent(id);
    setSelectedEvent(data);
    setPage(nextPage ?? "event");
    markOnline();
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
            <div className="hdr-title">gasvision.ru</div>
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

      <div className="layout">
        <aside className="sidebar">
          <div className={`nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => setPage("dashboard")}>
            <span>Дашборд</span>
            <span className="nav-badge">{dashboardEvents.length}</span>
          </div>
          <div className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => setPage("history")}>
            <span>История</span>
            <span className="nav-badge">{historyEvents.length}</span>
          </div>
          <div className={`nav-item ${page === "stations" ? "active" : ""}`} onClick={() => setPage("stations")}>
            <span>Станции</span>
            <span className="nav-badge">{stations.length}</span>
          </div>
        </aside>

        <main className="main">
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
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardEvents.length ? (
                        dashboardEvents.map((event) => (
                          <tr key={event.id} className="clickable table-row" onClick={() => openEvent(event.id, "event")}>
                            <td>{fmtTime(event.created_at)}</td>
                            <td>{sourceBadge(event.source)}</td>
                            <td>{event.title}</td>
                            <td>{event.station_name}</td>
                            <td>{severityBadge(event.severity)}</td>
                            <td>{statusBadge(event.status)}</td>
                            <td className="row-action">→</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
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
                  <div className="meta">Фильтрация по доступным станциям</div>
                </div>
                <div className="card-body toolbar">
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
                </div>
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
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {historyEvents.length ? (
                        historyEvents.map((event) => (
                          <tr key={event.id} className="clickable table-row" onClick={() => openEvent(event.id, "event")}>
                            <td>{fmtDateTime(event.created_at)}</td>
                            <td>{sourceBadge(event.source)}</td>
                            <td>{event.title}</td>
                            <td>{event.station_name}</td>
                            <td>{severityBadge(event.severity)}</td>
                            <td>{statusBadge(event.status)}</td>
                            <td className="row-action">→</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="empty-cell">
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
            <section className="page active">
              <div className="crumbs">
                <button onClick={() => setPage("history")}>← Назад</button>
                <span>/</span>
                <span>{selectedEvent.id}</span>
              </div>
              <div className="detail-grid">
                <div className="detail-left">
                  <div className="card">
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
                      {selectedEvent.preview_image_url || selectedEvent.clip_url ? (
                        <div className="media-summary-grid">
                          <div className="media-summary-card">
                            <div className="media-summary-label">Изображение</div>
                            {renderMediaPreview("image", selectedEvent.preview_image_url, selectedEvent.title)}
                            {selectedEvent.preview_image_url ? mediaLink(selectedEvent.preview_image_url, "Открыть изображение") : null}
                          </div>
                          <div className="media-summary-card">
                            <div className="media-summary-label">Клип</div>
                            {renderMediaPreview("clip", selectedEvent.clip_url, selectedEvent.title)}
                            {selectedEvent.clip_url ? mediaLink(selectedEvent.clip_url, "Открыть клип") : null}
                          </div>
                        </div>
                      ) : (
                        <div className="empty-state">Медиа пока не прикреплены.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="detail-right">
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
                  <div className="card">
                    <div className="card-header">
                      <h2>Все медиа события</h2>
                    </div>
                    <div className="card-body">
                      {selectedEvent.media.length ? (
                        <div className="media-grid">
                          {selectedEvent.media.map((item, index) => (
                            <div key={`${item.kind}-${index}`} className="media-item">
                              <div className="media-kind">{item.kind === "image" ? "Изображение" : "Клип"}</div>
                              {renderMediaPreview(item.kind, item.s3_url, `${selectedEvent.title} ${item.kind}`)}
                              {mediaLink(item.s3_url)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state">Медиа пока не прикреплены.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
