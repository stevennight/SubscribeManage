# syntax=docker/dockerfile:1.7

FROM python:3.11-slim

ARG SUBSCRIBEMANAGE_VERSION=0.1.0-dev
ARG SUBSCRIBEMANAGE_COMMIT=
ARG SUBSCRIBEMANAGE_BUILD_DATE=

WORKDIR /app

ENV SUBSCRIBEMANAGE_VERSION=${SUBSCRIBEMANAGE_VERSION} \
    SUBSCRIBEMANAGE_COMMIT=${SUBSCRIBEMANAGE_COMMIT} \
    SUBSCRIBEMANAGE_BUILD_DATE=${SUBSCRIBEMANAGE_BUILD_DATE} \
    PYTHONUNBUFFERED=1

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY app/ app/

# Create data directories
RUN mkdir -p data uploads

EXPOSE 8000

LABEL org.opencontainers.image.title="SubscribeManage backend" \
      org.opencontainers.image.description="Subscription management API" \
      org.opencontainers.image.source="https://github.com/stevennight/SubscribeManage" \
      org.opencontainers.image.version="${SUBSCRIBEMANAGE_VERSION}" \
      org.opencontainers.image.revision="${SUBSCRIBEMANAGE_COMMIT}" \
      org.opencontainers.image.created="${SUBSCRIBEMANAGE_BUILD_DATE}"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
