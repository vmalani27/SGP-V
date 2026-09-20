FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /content-sync .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /content-sync /usr/local/bin/content-sync

ENTRYPOINT ["/usr/local/bin/content-sync"]
