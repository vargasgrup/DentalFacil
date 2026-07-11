FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh \
    && mkdir -p /app/app/assets/uploads /app/uploads/tooth_media

ENV PORT=8001
EXPOSE 8001

CMD ["./start.sh"]
