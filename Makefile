.PHONY: dev backend frontend db migrate db-shell install test-backend

db:
	docker compose up -d db

db-down:
	docker compose down

backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

frontend:
	cd frontend && npm run dev

migrate:
	cd backend && alembic upgrade head

makemigrations:
	cd backend && alembic revision --autogenerate -m "$(msg)"

db-shell:
	docker compose exec db psql -U dentalsimple -d dentalsimple

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

test-backend:
	cd backend && pip install -q -r requirements-dev.txt && python -m pytest -q

dev:
	@echo "Inicia db, backend y frontend en terminales separadas:"
	@echo "  make db && make migrate && make backend  (terminal 1)"
	@echo "  make frontend                           (terminal 2)"
	@echo ""
	@echo "Backend: http://localhost:8001  (docs: /docs)"
	@echo "Frontend: http://localhost:3001"
