FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ python3 \
    && rm -rf /var/lib/apt/lists/*

COPY setup.sh /app/setup.sh
RUN bash /app/setup.sh
