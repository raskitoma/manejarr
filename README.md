# <img src="public/favicon.svg" width="48" height="48" align="center" /> Manejarr

> **Automated Torrent Orchestration for the Modern Media Lab.**

Manejarr is a high-performance, containerized service-to-service orchestration layer designed to bridge the gap between **Deluge** and the **\*arr suite** (Radarr, Sonarr, and optionally Lidarr). It automates the entire torrent lifecycle—from quality verification to retention-based cleanup—ensuring your library stays lean and your seeding ratios stay healthy.

---

## ✨ Features

- **🦜 Automated Lifecycle Management** — Seamlessly monitors, labels, and pauses torrents based on *arr import status.
- **🌍 Multilingual Support** — Fully localized in **English** and **Spanish** with easy-to-switch interface.
- **🌓 Dynamic Theming** — Modern UI with support for **Light**, **Dark**, and **System** color schemes.
- **🛡️ Hardened Security** — AES-256-GCM encryption for credentials, secure session management, and password strength validation.
- **✅ Quality Verification** — Validates that downloads meet your specific quality profiles before transitioning.
- **⏳ Retention Rules** — Granular control over seeding time and ratio thresholds.
- **📅 Advanced Scheduler** — Integrated cron scheduler with a modern, slider-based interface.
- **📊 Real-time Dashboard** — Live torrent overview with connection health indicators.
- **📜 Rich Event Logging** — Detailed history with category filtering and CSV export capabilities.
- **Encoding Cleanup** — Optionally review HandBrake output against Radarr and Sonarr import records and delete verified files individually or in batches.
- **🐳 Docker Native** — Single-container deployment with zero external dependencies (internal SQLite).

---

## 🚀 Quick Start

### Prerequisites

- **Docker** & **Docker Compose**
- **Deluge v2.2.0+** (Label plugin enabled)
- **Radarr / Sonarr** (Latest stable)
- **Lidarr** (optional — for music/album lifecycle management)

### Deploy in Seconds

```bash
git clone https://github.com/raskitoma/manejarr.git
cd manejarr
chmod +x deploy.sh
./deploy.sh
```

The deployment script handles the setup interactively:
1. **Configuration**: Prompts for Port and Timezone.
2. **Security**: Asks for an admin password (or auto-generates a strong 16-char one).
3. **Encryption**: Generates unique AES-256 seeds for data encryption.
4. **Environment**: Populates a production-ready `.env` file and launches the container.

**Web Interface:** [http://localhost:3000](http://localhost:3000)
(Or your configured port)

---

## ⚙️ Configuration & Setup

1. **Service Integration**: Head to **Settings** to link your Deluge and *arr instances (Lidarr is optional).
2. **Retention Rules**: Define your minimum seeding days and ratio requirements.
3. **Labels**: Manejarr recognizes these Deluge labels:
   - **Working labels** — freshly downloaded, awaiting verification. Manejarr matches these against *arr history regardless of the exact name: the legacy shared `media`, or per-app `radarr` / `sonarr` / `lidarr` labels if you split your download-client categories. Any label that isn't `ignore`/`fordeletion` is treated as a working torrent.
   - `ignore` — Successfully imported, currently seeding (Manejarr sets this after verification).
   - `fordeletion` — Retention met, paused, awaiting manual/auto cleanup (Manejarr sets this in Phase 2).

---

## 🛠️ How It Works

### Phase 1: The Handshake
Manejarr scans every working torrent (anything not already `ignore`/`fordeletion`), verifies its hash against Radarr / Sonarr / Lidarr history, and confirms the file meets your quality cutoff. Ownership is decided by which *arr actually grabbed the download — not by the Deluge label — so a shared `media` label or split `radarr`/`sonarr`/`lidarr` labels both work. Once verified, it unmonitors the item in the *arr suite and relabels it to `ignore`.

### Phase 2: The Harvest
It monitors `ignore` torrents against your retention rules. Once the time or ratio threshold is crossed, the torrent is paused and relabeled to `fordeletion`.

The torrent workflow labels and pauses torrents. Encoding Cleanup is a separate, optional action that permanently deletes selected files from the writable encoding output mount after confirmation.

### Optional Encoding Cleanup

In a setup with Jackett, Deluge, and HandBrake, Radarr and Sonarr find releases through Jackett and send them to Deluge. Deluge downloads into `incomplete`, moves the original payload to `completed` for seeding, and copies or extracts an input to the HandBrake watch folder. HandBrake encodes that input into its output folder. Radarr and Sonarr import the encode into their final libraries and may rename it. Encoding Cleanup helps remove the output copy after import.

For example, these mounts give Deluge and the *arr apps different views of `/downloads/completed`:

| App | NAS source | Container path |
| --- | --- | --- |
| Deluge | `/mnt/backup/downloads` | `/downloads` |
| HandBrake | `/mnt/backup/downloads/copied` | `/watch` |
| HandBrake | `/mnt/backup/downloads/HBWork/output` | `/output` |
| Radarr and Sonarr | `/mnt/backup/downloads` | `/downloads` |
| Radarr and Sonarr | `/mnt/backup/downloads/HBWork/output` | `/downloads/completed` |

For Manejarr, add the following to your existing `.env`. Replace the library path with the host directory that corresponds to the prefix your *arr apps report. Subdirectories such as movies, concerts, documentaries, and series can all live under this mount.

```dotenv
CLEANUP_OUTPUT_HOST=/mnt/backup/downloads/HBWork/output
CLEANUP_LIBRARY_HOST=/path/to/final/library
CLEANUP_RADARR_OUTPUT=/downloads/completed
CLEANUP_SONARR_OUTPUT=/downloads/completed
CLEANUP_RADARR_LIBRARY=/media
CLEANUP_SONARR_LIBRARY=/media
```

Run Compose with the optional override:

```bash
docker compose -f docker-compose.yml -f docker-compose.cleanup.example.yml up -d --build
```

The override mounts the encode output read-write at `/cleanup/output` and the library parent read-only at `/cleanup/library`. Paths under each reported prefix must have the same relative layout inside the corresponding Manejarr mount. For a remote Manejarr host, either mount the NAS shares on that host and use the local override or run the helper below. To disable local cleanup, recreate the service with the base Compose file.

Open **Encoding Cleanup** to see the output files, their last-modified age (for example, `1d 16h ago`), import status, and final library path. Search by file or destination path, filter by import status or app, and sort the list. Each page shows up to 25 files. Click a verified row to select it, or use the header checkbox to select all verified files on the current filtered page. Review the selected paths before confirming deletion. Manejarr requires an exact output path in recent successful import history, a current *arr file record, and a corresponding regular library file of the same size. It checks file identity and the library again at deletion time. The scan checks up to 10,000 recent import records per app. Unavailable or ambiguous records leave files ineligible. The feature uses import records and size checks, with no content hashing. It removes selected output videos and logs each result under **Encoding Cleanup**. If the immediate enclosing folder has a matching release name and is empty after deletion, Manejarr removes that folder too. This also applies in helper mode. The encoding output root and its top-level `media` directory are always preserved. Folders with remaining files, such as other episodes or sidecars, are preserved.

---

### Optional NAS helper

Run the helper on the media host when the Manejarr host cannot mount its shares. The helper lists files, reads file metadata, and checks source and library file identity immediately before deleting an output video. Manejarr keeps the Radarr and Sonarr credentials, import matching, and confirmation UI. The helper does not need those credentials or the Manejarr database.

On the NAS, set the following in a private helper environment file such as `.env.helper`. Generate the shared token with `openssl rand -hex 32`. Bind the helper to a private encrypted network interface such as a Tailscale address. For access outside that network, use HTTPS with a trusted certificate. Keep the helper off public interfaces.

```dotenv
CLEANUP_HELPER_TOKEN=<shared random token>
CLEANUP_HELPER_BIND_IP=<NAS private network address>
CLEANUP_HELPER_UID=1000
CLEANUP_HELPER_GID=1000
CLEANUP_OUTPUT_HOST=/mnt/backup/downloads/HBWork/output
```

Set the UID and GID to an account that can remove files from the output directories and read the library. Add a NAS-side Compose override such as `docker-compose.helper-library.yml` with the final library mounted read-only:

```yaml
services:
  cleanup-helper:
    volumes:
      - /path/to/final/library:/cleanup/library:ro
```

When the two *arr apps use different views of the same prefix, set `CLEANUP_HELPER_APP_SUBDIRS=true` in `.env.helper` and mount libraries under app-specific directories. For example, map Radarr's `/mnt/video` to `/cleanup/library/radarr/video` and Sonarr's `/mnt/series2` to `/cleanup/library/sonarr/series2`. Both corresponding library prefixes on Manejarr would be `/mnt`.

```bash
chmod 600 .env.helper
docker compose --env-file .env.helper -f docker-compose.cleanup-helper.yml -f docker-compose.helper-library.yml up -d --build
```

On the Manejarr host, add the following to the existing `.env` and rebuild with the regular Compose setup. Use the same token and the library prefixes as seen by the *arr apps. The `/media` values below are examples for a shared library mount.

```dotenv
ENCODING_CLEANUP=true
CLEANUP_STORAGE=helper
CLEANUP_HELPER_URL=http://<NAS-private-network-address>:8789
CLEANUP_HELPER_TOKEN=<same shared random token>
CLEANUP_RADARR_OUTPUT=/downloads/completed
CLEANUP_SONARR_OUTPUT=/downloads/completed
CLEANUP_RADARR_LIBRARY=/media
CLEANUP_SONARR_LIBRARY=/media
```

Use HTTP only over an encrypted private network. If the helper is unreachable, cleanup is unavailable until it reconnects. To return to local mounts, use the local Compose override. To turn cleanup off, set `ENCODING_CLEANUP=false` and recreate Manejarr with its regular Compose setup.

---

## 💻 CLI & Maintenance

### Reset Administrator Password
```bash
docker exec manejarr node scripts/reset-password.js <new-password>
```

### Deployment Options
```bash
./deploy.sh --port 8080                # Use custom port
./deploy.sh --reset-password newpass   # Reset credentials
./deploy.sh --generate-key             # Rotate encryption keys
```

---

## 🌐 Custom Domain & Security

Manejarr is designed to be lean and fast. If you plan to expose it to the internet via a custom domain (e.g., `manejarr.yourdomain.com`), we strongly recommend the following:

- **Reverse Proxy**: Use **Nginx Proxy Manager**, **Traefik**, or **Caddy** to handle SSL (HTTPS) termination.
- **External Auth**: While Manejarr has built-in authentication, for public exposure we suggest protecting the route using a centralized identity provider like **Authelia** or **Authentik** via **Proxy Provider** or **Forward Auth** methods.
- **VPN**: For maximum security, keep Manejarr internal and access it via **Tailscale** or **Wireguard**.

---

## 🧬 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | Node.js 20, Express 4 |
| **Frontend** | Vanilla JavaScript, Vite 6, CSS Variables |
| **Database** | SQLite (sql.js) |
| **Security** | AES-256-GCM, BCrypt, Auto-Logout |
| **i18n** | JSON-based Localization (EN/ES) |
| **Container** | Docker (Alpine) |

---

## 📄 License

MIT © 2026 Manejarr Team

