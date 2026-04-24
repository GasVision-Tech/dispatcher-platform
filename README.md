# GasVision Dispatcher Platform

Отдельный контур для панели диспетчера и BFF.

`event-service` запускается отдельно как внешний сервис и подключается в BFF по `EVENT_SERVICE_BASE_URL`.

Состав платформы:

- `bff`
- `frontend`
- `nginx`
- `bff-db`

## Как запускать

1. Сначала подними `event-service` из соседнего репозитория:

```bash
cd ../Event-service
cp .env.example .env
docker compose up --build
```

2. Затем подними саму платформу из папки `dispatcher-platform`:

```bash
cp .env.example .env
docker compose up --build
```

Или через `Makefile`:

```bash
make up
```

После старта:

- общий вход через NGINX: `http://localhost:8080`
- Swagger внешнего `event-service`: `http://localhost:8000/docs`
- Swagger `bff`: `http://localhost:8010/docs`
- BFF внутри сети docker: `http://bff:8010`
- Event Service для BFF: `http://host.docker.internal:8000` внутри контейнера BFF
- Event Service с хоста: `http://localhost:8000`

Если `event-service` доступен не на локальной машине, переопредели адрес:

```bash
EVENT_SERVICE_BASE_URL=http://<host>:8000 docker compose up --build
```

Для постоянной локальной настройки можно сохранить это значение в [`.env.example`](/dispatcher-platform/.env.example) по образцу `.env`.

## Полезные команды

```bash
make up
make down
make build
make rebuild
make logs
make ps
make clean
```

## Smoke Test

Для быстрой проверки после изменений:

```bash
make smoke
```

Если нужно еще и создать тестовое событие перед проверкой:

```bash
make smoke-seed
```

Что проверяет smoke test:

- `event-service /health`
- `bff /health`
- логин в `bff`
- `me`
- `stations`
- `dashboard summary`
- `events`
- `event detail`

## Схема запросов

- browser -> `nginx`
- `nginx /` -> `frontend`
- `nginx /api` -> `bff`
- `bff` -> внешний `event-service`

## Демо-доступ

- email: `dispatcher1@gasvision.local`
- password: `demo123`
