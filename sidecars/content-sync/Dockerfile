ARG BUILD_BASE_IMAGE=public.ecr.aws/i9t1l0m7/labops-golang:1.23-alpine
ARG RUNTIME_BASE_IMAGE=public.ecr.aws/i9t1l0m7/labops-alpine:3.20

FROM ${BUILD_BASE_IMAGE} AS builder
ARG DEFAULT_CDN_URL=""

WORKDIR /app

COPY go.mod ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.defaultCDNURL=${DEFAULT_CDN_URL}" -trimpath -o /content-sync .

FROM ${RUNTIME_BASE_IMAGE}
ARG DEFAULT_CDN_URL=""
ENV CDN_URL=${DEFAULT_CDN_URL}

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /content-sync /usr/local/bin/content-sync

ENTRYPOINT ["/usr/local/bin/content-sync"]
