#!/usr/bin/env bash
# Starts the whole platform with docker compose on Linux (or any shell with Docker), from whichever configuration you have:
#
#   bash scripts/docker-up.sh            build and start (docker compose up --build); extra arguments go to compose, e.g. -d
#
# docker compose reads the root .env, never config/application.yml. So:
#   - if .env exists, it is used as it is (edit it, or copy .env.example to .env and fill in the blanks);
#   - otherwise, if config/application.yml exists, .env is written from it (with Node if installed, else with a throwaway node container);
#   - otherwise the script stops and says what to do.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
    if [ -f config/application.yml ]; then
        echo "Writing .env from config/application.yml..."
        if command -v node >/dev/null 2>&1; then
            (cd config && npm ci --silent) && node config/cli.js env-file
        else
            docker run --rm -v "$PWD":/w -w /w/config node:22-alpine sh -c "npm ci --silent && node cli.js env-file"
        fi
    else
        echo "There is no .env and no config/application.yml. Run:  cp .env.example .env   and fill in the blanks (see the README)." >&2
        exit 1
    fi
fi

exec docker compose up --build "$@"
