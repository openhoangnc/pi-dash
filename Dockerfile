# Stage 1: Build Frontend
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend (statically linked with musl for scratch compatibility)
FROM --platform=$BUILDPLATFORM ghcr.io/rust-cross/cargo-zigbuild:latest AS backend-builder
WORKDIR /app/backend
# Map Docker TARGETARCH to Rust target triple
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ]; then \
      echo "x86_64-unknown-linux-musl" > /tmp/rust_target.txt; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
      echo "aarch64-unknown-linux-musl" > /tmp/rust_target.txt; \
    else \
      echo "Unsupported architecture: $TARGETARCH" && exit 1; \
    fi && \
    rustup target add $(cat /tmp/rust_target.txt)

COPY backend/Cargo.toml backend/Cargo.lock ./
# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo zigbuild --release --target $(cat /tmp/rust_target.txt) 2>/dev/null || true

# Now build with real source
COPY backend/src/ src/
RUN touch src/main.rs && \
    cargo zigbuild --release --target $(cat /tmp/rust_target.txt) && \
    cp "target/$(cat /tmp/rust_target.txt)/release/pi-dash" pi-dash

# Stage 3: Minimal runtime from scratch
FROM scratch
WORKDIR /app
COPY --from=backend-builder /app/backend/pi-dash /app/pi-dash
COPY --from=frontend-builder /app/frontend/dist /app/static

ENV PI_DASH_PORT=3300
ENV PI_DASH_USER=admin
ENV PI_DASH_PASS=admin

EXPOSE 3300

CMD ["/app/pi-dash"]
