# ContractIQ API image: Python 3.12, Tesseract OCR (English + Hindi), locked dependencies.
# Optional: the default deployment runs the API natively on Render (render.yaml). This image runs
# the same API on any container host (Render Docker, Railway, Fly.io, Cloud Run, Azure, a VPS).
#
# Build from the REPOSITORY ROOT (the classifier files are in data/models/):
#   docker build -f backend/Dockerfile -t contractiq-api .
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    NYAYASIM_TESSERACT=/usr/bin/tesseract \
    NYAYASIM_DATA_DIR=/srv/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/alembic.ini backend/start.sh ./
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY backend/scripts ./scripts
# The two trained classifier files (public orders only), found by app/api/insights.py.
COPY data/models/ ./models/

# Uploads, outbox and the embedding-model cache live in /srv/data: mount a volume or disk there.
# Created owned by the app user, so the API can write to it even when the volume starts empty.
RUN useradd --create-home --uid 10001 contractiq \
    && mkdir -p /srv/data/models /srv/data/uploads /srv/data/outbox \
    && chown -R contractiq:contractiq /srv/data \
    && chmod +x start.sh
USER contractiq

ENV PATH="/srv/backend/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1
# Runs the migrations, then the API on $PORT (hosts such as Render, Railway and Cloud Run set it).
CMD ["./start.sh"]
