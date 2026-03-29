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

Из папки `BFF-service`:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

Или через Docker:

```bash
docker compose up --build
```

По умолчанию BFF ожидает `event-service` на `http://localhost:8000`.

## Демо-доступ

- email: `dispatcher1@gasvision.local`
- password: `demo123`

Также сидится второй пользователь:

- email: `dispatcher2@gasvision.local`
- password: `demo123`
