ARG BUILD_BASE_IMAGE=public.ecr.aws/i9t1l0m7/labops-golang:1.23-alpine
FROM ${BUILD_BASE_IMAGE} AS builder

WORKDIR /app

COPY go.mod ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /content-sync .

ARG RUNTIME_BASE_IMAGE=public.ecr.aws/i9t1l0m7/labops-alpine:3.20
FROM ${RUNTIME_BASE_IMAGE}

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /content-sync /usr/local/bin/content-sync

ENTRYPOINT ["/usr/local/bin/content-sync"]
