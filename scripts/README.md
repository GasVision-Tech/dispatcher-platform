# Debug Scripts

`smoke_test.py` прогоняет базовую проверку платформы:

- `event-service /health`
- `bff /health`
- логин в `bff`
- `me`
- `stations`
- `dashboard summary`
- `events`
- `event detail`

Опционально может создать тестовое событие в `event-service`.
