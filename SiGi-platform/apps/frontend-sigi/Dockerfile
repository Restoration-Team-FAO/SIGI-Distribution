FROM node:20-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/frontend-sigi/package.json apps/frontend-sigi/package.json
COPY apps/sigi-api/package.json apps/sigi-api/package.json
COPY libs/contracts/package.json libs/contracts/package.json
COPY libs/domain/package.json libs/domain/package.json
COPY libs/shared/package.json libs/shared/package.json
COPY libs/ui/package.json libs/ui/package.json
COPY services/bridge/package.json services/bridge/package.json
COPY services/connectors/kobo/package.json services/connectors/kobo/package.json
COPY services/connectors/excel/package.json services/connectors/excel/package.json
COPY services/connectors/odoo/package.json services/connectors/odoo/package.json
COPY services/connectors/postgis/package.json services/connectors/postgis/package.json

RUN npm ci

COPY apps/frontend-sigi apps/frontend-sigi
COPY libs/contracts libs/contracts
COPY libs/domain libs/domain
COPY libs/shared libs/shared
COPY libs/ui libs/ui

ARG VITE_SIGI_API_URL=http://127.0.0.1:3000/api
ARG VITE_GEOSERVER_ENABLED=false
ARG VITE_GEOSERVER_WMS_URL=http://127.0.0.1:8081/geoserver/wms
ARG VITE_GEOSERVER_TERRITORIES_LAYER=sigi:public_territories
ARG VITE_GEOSERVER_PROJECT_LAYER=sigi:public_project_polygons
ENV VITE_SIGI_API_URL=$VITE_SIGI_API_URL
ENV VITE_GEOSERVER_ENABLED=$VITE_GEOSERVER_ENABLED
ENV VITE_GEOSERVER_WMS_URL=$VITE_GEOSERVER_WMS_URL
ENV VITE_GEOSERVER_TERRITORIES_LAYER=$VITE_GEOSERVER_TERRITORIES_LAYER
ENV VITE_GEOSERVER_PROJECT_LAYER=$VITE_GEOSERVER_PROJECT_LAYER
# Vista de acceso: institución y canal de soporte de la instancia (opcionales).
ARG VITE_SIGI_INSTITUTION_NAME=
ARG VITE_SIGI_SUPPORT_EMAIL=
ARG VITE_SIGI_SUPPORT_LABEL=
ENV VITE_SIGI_INSTITUTION_NAME=$VITE_SIGI_INSTITUTION_NAME
ENV VITE_SIGI_SUPPORT_EMAIL=$VITE_SIGI_SUPPORT_EMAIL
ENV VITE_SIGI_SUPPORT_LABEL=$VITE_SIGI_SUPPORT_LABEL
ARG SIGI_GIT_SHA=
ENV SIGI_GIT_SHA=$SIGI_GIT_SHA

RUN npm --workspace apps/frontend-sigi run build

FROM nginx:1.27-alpine

COPY apps/frontend-sigi/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/frontend-sigi/dist /usr/share/nginx/html

EXPOSE 80
