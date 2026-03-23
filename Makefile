.PHONY: dev run test check db-migrate db-reset db-types

# Start Next.js dev server only
dev:
	cd frontend && npm run dev

# Start all services: local Supabase + Next.js dev server
run:
	supabase start
	cd frontend && npm run dev

# Run frontend tests
test:
	cd frontend && npm test

# Run typecheck + lint + format check
check:
	cd frontend && npm run typecheck && npm run lint && npm run format:check

# Run pending Supabase migrations against the local DB
db-migrate:
	supabase db push

# Reset local DB and re-seed
db-reset:
	./scripts/db-reset.sh

# Regenerate TypeScript types from Supabase schema
db-types:
	./scripts/generate-types.sh
