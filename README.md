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

> [!IMPORTANT]
> **Safety First:** Manejarr is non-destructive. It will **never** delete your files or torrents—it only manages labels and pause states.

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

