FROM node:20-alpine AS builder

WORKDIR /app

ARG SUITE_BASE_PATH=./
ARG VITE_BUILD_STAMP

ENV SUITE_BASE_PATH=${SUITE_BASE_PATH}
ENV VITE_BUILD_STAMP=${VITE_BUILD_STAMP}

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine

WORKDIR /app

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html/standalone/s_tts
COPY config /app/config
COPY scripts/start_services.sh /app/start_services.sh
RUN chmod +x /app/start_services.sh

EXPOSE 5184

CMD ["/app/start_services.sh"]
