FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY setup.sh /app/setup.sh
RUN bash /app/setup.sh

WORKDIR /app/site
