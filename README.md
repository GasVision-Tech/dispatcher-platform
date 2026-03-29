# GasVision Dispatcher Platform

Отдельный контур для панели диспетчера и BFF.

`event-service` остается самостоятельным сервисом и подключается как соседний репозиторий из `../Event-service`.

Состав платформы:

- `event-service`
- `bff`
- `frontend`
- `nginx`
- `event-db`
- `bff-db`

## Как запускать

Из папки `dispatcher-platform`:

```bash
docker compose up --build
```

После старта:

- общий вход через NGINX: `http://localhost:8080`
- BFF внутри сети docker: `http://bff:8010`
- Event Service внутри сети docker: `http://event-service:8000`

## Схема запросов

- browser -> `nginx`
- `nginx /` -> `frontend`
- `nginx /api` -> `bff`
- `bff` -> `event-service`

## Демо-доступ

- email: `dispatcher1@gasvision.local`
- password: `demo123`
