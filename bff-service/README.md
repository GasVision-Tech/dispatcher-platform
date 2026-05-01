# GasVision BFF Service

MVP BFF для панели диспетчера.

Что умеет:
- логин диспетчера;
- профиль текущего пользователя;
- список доступных станций;
- агрегированный список событий из `event-service`;
- детали события;
- смена статуса события;
- сводка для dashboard.

## Запуск

Сначала подними внешний `event-service`:

```bash
cd ../../Event-service
cp .env.example .env
docker compose up --build
```

Затем из папки `bff-service`:

```bash
cp .env.example .env
docker compose up --build
```

Этот compose поднимает только BFF и его собственную Postgres БД.

Если `event-service` доступен не на локальной машине, переопредели адрес:

```bash
EVENT_SERVICE_BASE_URL=http://<host>:8000 docker compose up --build
```

Для запуска без Docker нужно передать внешний `database_url` и адрес `event-service`:

```bash
pip install -r requirements.txt
database_url=postgresql+psycopg2://bff_user:<password>@localhost:5434/bff_db \
event_service_base_url=http://localhost:8000 \
uvicorn app.main:app --reload --port 8010
```

В контейнере BFF по умолчанию используется внешний `event-service` по адресу `http://host.docker.internal:8000`.

Шаблон переменных приложения лежит в [`.env.example`](/Users/nikitakomarov/Desktop/GasVision/develop/dispatcher-platform/bff-service/.env.example).

## Демо-доступ

- email задается через `demo_dispatcher_email`
- password задается через `demo_dispatcher_password`

Также сидится второй пользователь:

- email: `dispatcher2@gasvision.local`
- password задается через `demo_dispatcher_password`
