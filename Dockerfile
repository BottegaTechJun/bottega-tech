FROM oven/bun:1 AS base
WORKDIR /app

# Копируем весь монорепозиторий (корневой package.json, bun.lock и папки apps/packages)
COPY . .

# Устанавливаем все зависимости воркспейса
RUN bun install

WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]
