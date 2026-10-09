# Frontend image: builds the Angular app, serves it with nginx, and proxies /api to the order and executor services (the same split the
# dev server's proxy makes). Context: the repository root (docker-compose.yml sets it), because the build reads config/ as well as frontend/.
FROM node:22-alpine AS build
WORKDIR /repo
COPY config/package*.json config/
RUN cd config && npm ci
COPY config config
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
# The address the BROWSER uses for the auth-service (it is called directly, not through the proxy).
ARG PUBLIC_AUTH_URL
ENV PUBLIC_AUTH_URL=$PUBLIC_AUTH_URL
RUN node config/cli.js frontend && cd frontend && npx ng build --configuration production

FROM nginx:1.27-alpine
# nginx fills ${ORDER_PORT} and ${EXECUTOR_PORT} from the container's environment when it starts.
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/frontend/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
