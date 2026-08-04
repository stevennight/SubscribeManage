# Build stage
FROM node:20-alpine AS build
ARG SUBSCRIBEMANAGE_VERSION=0.1.0-dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_APP_VERSION=${SUBSCRIBEMANAGE_VERSION}
RUN npm run build

# Production stage
FROM nginx:alpine
ARG SUBSCRIBEMANAGE_VERSION=0.1.0-dev
ARG SUBSCRIBEMANAGE_COMMIT=
ARG SUBSCRIBEMANAGE_BUILD_DATE=
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
LABEL org.opencontainers.image.title="SubscribeManage frontend" \
      org.opencontainers.image.description="Subscription management web UI" \
      org.opencontainers.image.source="https://github.com/stevennight/SubscribeManage" \
      org.opencontainers.image.version="${SUBSCRIBEMANAGE_VERSION}" \
      org.opencontainers.image.revision="${SUBSCRIBEMANAGE_COMMIT}" \
      org.opencontainers.image.created="${SUBSCRIBEMANAGE_BUILD_DATE}"
CMD ["nginx", "-g", "daemon off;"]
