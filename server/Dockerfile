# The API and the worker are the same image run with different commands: they
# share every dependency and differ only in which entrypoint starts.

# ---------- build ----------
FROM node:22-slim AS build

WORKDIR /app

# Dependencies first, so a change to source does not re-download the tree.
# .npmrc comes too: it carries the peer-resolution setting without which a
# clean `npm ci` fails on this dependency tree.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# Reinstalling without dev dependencies is cheaper than trying to prune them,
# and leaves node_modules exactly as production will use it.
RUN npm ci --omit=dev


# ---------- run ----------
FROM node:22-slim AS runtime

# yt-dlp is a program, not an npm package, so nothing in package.json brings it.
# YouTube stopped serving caption tracks to anyone but itself, and this is the
# only route to them — without it every YouTube source fails with an
# explanation while VTT and SRT upload keep working.
#
# The _linux build is self contained: no Python on the image, one binary.
# Pinned rather than "latest" so a rebuild is the same image; bump it when
# YouTube changes something and yt-dlp catches up.
#
# The asset is architecture specific and the two names are not predictable from
# one another, so the mapping is explicit. TARGETARCH is set by buildkit, which
# is what lets an arm64 laptop build the amd64 image a VPS will run.
ARG YTDLP_VERSION=2026.07.04
ARG TARGETARCH
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) ytdlp_asset='yt-dlp_linux' ;; \
    arm64) ytdlp_asset='yt-dlp_linux_aarch64' ;; \
    *) echo "no yt-dlp build for ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${ytdlp_asset}" \
       -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && yt-dlp --version \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# ffmpeg arrives through the ffmpeg-static package rather than apt, so
# node_modules carries it and there is nothing else to install.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Read at runtime by the migrate entrypoint, and they are the same files that
# are in version control rather than a schema push.
COPY --from=build /app/drizzle ./drizzle

# Nothing here needs root, and a process that cannot write to its own image
# cannot be persuaded to.
USER node

EXPOSE 4000

# Overridden by the worker service in compose.
CMD ["node", "dist/index.js"]
