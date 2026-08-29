FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect admin/DRF static assets into STATIC_ROOT for WhiteNoise to serve.
# Django refuses to start with the placeholder SECRET_KEY when DEBUG=False,
# so a throwaway key is supplied for this build step only — it is never
# baked into the image or used at runtime.
RUN DJANGO_SECRET_KEY=build-time-only-not-a-runtime-secret \
    python manage.py collectstatic --noinput --clear

RUN adduser --disabled-password --no-create-home velora \
    && chown -R velora:velora /app
USER velora

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn velora.wsgi:application --bind 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-3}"]
