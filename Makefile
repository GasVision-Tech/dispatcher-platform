COMPOSE=docker compose
PYTHON=python3

.PHONY: up down build rebuild logs ps clean restart smoke smoke-seed

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) down
	$(COMPOSE) up --build

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

restart:
	$(COMPOSE) restart

clean:
	$(COMPOSE) down -v

smoke:
	$(PYTHON) scripts/smoke_test.py

smoke-seed:
	$(PYTHON) scripts/smoke_test.py --create-event
