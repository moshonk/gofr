# CamDHEA Facility Registry — Local Docker Deployment Guide

This guide walks you through deploying the GOFR Cambodia Facility Registry
(CamDHEA) on your own computer using Docker. It is written for users with
**low-to-medium technical experience** — no prior Docker or FHIR knowledge is
required.

By the end of this guide you will have a working CamDHEA registry running at
<http://localhost:4000> seeded with Cambodia's administrative boundaries and
ready for facility data entry.

---

## 1. What you will install

| Component        | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| **Git**          | To download the source code                          |
| **Docker**       | To run the registry without installing dependencies  |
| **Docker Compose** | To start all services together (usually bundled)   |

> Estimated time: **20–40 minutes**, mostly waiting for downloads/builds.
> Disk space required: **~5 GB**.
> RAM required: **8 GB minimum** (16 GB recommended).

---

## 2. Install the prerequisites

### 2.1 Install Git

- **Windows / macOS**: download and run the installer from
  <https://git-scm.com/downloads>.
- **Ubuntu / Debian Linux**:
  ```bash
  sudo apt update
  sudo apt install -y git
  ```

Verify:
```bash
git --version
```
You should see something like `git version 2.40.0`.

### 2.2 Install Docker Desktop (Windows/macOS) or Docker Engine (Linux)

- **Windows / macOS**: install Docker Desktop from
  <https://www.docker.com/products/docker-desktop/>. Launch it once after
  install so the Docker engine starts.
- **Ubuntu / Debian Linux**: follow the official instructions at
  <https://docs.docker.com/engine/install/ubuntu/>. Be sure to add your user to
  the `docker` group so you don't need `sudo` for every command:
  ```bash
  sudo usermod -aG docker $USER
  newgrp docker
  ```

Verify:
```bash
docker --version
docker compose version
```
You should see versions for both. If `docker compose version` fails but
`docker-compose --version` works, replace `docker compose` with
`docker-compose` in the commands below.

---

## 3. Get the source code

Open a terminal (Terminal on macOS/Linux, PowerShell or Git Bash on Windows)
and run:

```bash
git clone https://github.com/moshonk/gofr.git
cd gofr
git checkout camdhea-features
```

You should now be on the `camdhea-features` branch. Verify with:
```bash
git branch --show-current
```
The output should be `camdhea-features`.

---

## 4. Start the registry

Move into the docker folder:

```bash
cd instant/docker
```

Build and start all services in the background:

```bash
docker compose up -d --build
```

What this does:
1. Builds a custom GOFR image (this includes building the web frontend and
   backend — first run takes 5–15 minutes depending on your machine and
   internet speed).
2. Pulls the supporting service images (PostgreSQL, HAPI FHIR, Redis,
   Keycloak).
3. Starts everything and seeds the FHIR database from
   `instant/docker/initdb/01_seed.sql` (Cambodia administrative boundaries
   and CamDHEA profiles).

When the command finishes, check that everything is running:

```bash
docker compose ps
```

All five services (`gofr`, `hapi-fhir`, `fhir-db`, `redis`, `keycloak`) should
show status `running` or `Up`.

> **Tip:** to watch logs while things start, run
> `docker compose logs -f gofr`. Press `Ctrl+C` to stop watching (this does
> not stop the container).

---

## 5. Open the registry in your browser

Open <http://localhost:4000>.

Sign in with the default administrator account:

| Field    | Value           |
| -------- | --------------- |
| Email    | `root@gofr.org` |
| Password | `gofr`          |

You should land on the GOFR home page. From the side menu you can:

- **Facility Registry → Jurisdictions** — browse Cambodia's provinces,
  districts, ODs, communes and villages (loaded from the seed).
- **Facility Registry → Facilities** — view, search and add facilities.
- **Facility Registry → Add Facility** — open the CamDHEA facility
  questionnaire (HFID auto-generates).

> **Change the password** on first login (top-right user menu → Change
> Password) before exposing the instance to anyone else.

---

## 6. Common operations

### Stop the registry (without deleting data)
```bash
docker compose stop
```

### Start it again
```bash
docker compose start
```

### Restart everything
```bash
docker compose restart
```

### View logs for a single service
```bash
docker compose logs -f gofr
docker compose logs -f fhir
```

### Apply code updates from GitHub
```bash
cd /path/to/gofr
git pull
cd instant/docker
docker compose up -d --build
```

### Remove everything (⚠️ deletes all entered data)
```bash
docker compose down -v
```
The `-v` flag also removes the database volume. Omit it to keep your data.

---

## 7. Troubleshooting

### "Port is already in use"
GOFR uses ports **4000** (UI), **8080** (FHIR), **8084** (Keycloak). If
another program is using one of these:

1. Stop the other program, **or**
2. Edit `instant/docker/docker-compose.yml` and change the left side of the
   `ports:` mapping (e.g. `"4001:4000"` to expose GOFR on port 4001).
3. Run `docker compose up -d` again.

### "Cannot connect to the Docker daemon"
- **Windows / macOS**: make sure Docker Desktop is running (look for the
  whale icon in the system tray / menu bar).
- **Linux**: start the service with `sudo systemctl start docker`.

### Login returns 401 / "invalid credentials"
The first-time bootstrap may not have finished yet. Wait 30–60 seconds and
try again. If it still fails:

```bash
docker compose logs --tail=200 gofr
```

Look for lines containing `defaultSetup` or `loadFSHFiles`. If you see a
stack trace, please open an issue on GitHub with the log output attached.

### Map shows the wrong region
The default map center is Phnom Penh, Cambodia. If you see a different
location, force-refresh the page (Ctrl+Shift+R / Cmd+Shift+R) to clear the
browser cache.

### Build fails with `node-gyp` or `python` errors
This usually means Docker doesn't have enough memory. In Docker Desktop go to
**Settings → Resources** and raise the memory limit to **at least 6 GB**,
then run `docker compose up -d --build` again.

---

## 8. What's running where

| Service     | URL                              | Purpose                               |
| ----------- | -------------------------------- | ------------------------------------- |
| GOFR UI     | <http://localhost:4000>          | The registry web app                  |
| HAPI FHIR   | <http://localhost:8080/fhir>     | Underlying FHIR R4 server             |
| Keycloak    | <http://localhost:8084>          | Optional identity provider (off by default) |
| PostgreSQL  | (internal, port 5432)            | Database for HAPI FHIR                |
| Redis       | (internal, port 6379)            | Session cache for GOFR                |

For any further questions, see the main repository
[README](../README.md) or open an issue at
<https://github.com/moshonk/gofr/issues>.
