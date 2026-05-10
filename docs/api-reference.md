# GoFR API Reference

> **Global Open Facility Registry (GoFR)** — REST API documentation for integrators.
>
> **Base URL:** `http://<host>:<port>` (default port `8080`)
>
> All endpoints return JSON unless otherwise noted. Dates follow ISO 8601.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Session](#session)
3. [Users & Roles](#users--roles)
4. [FHIR Resources](#fhir-resources)
5. [Questionnaire](#questionnaire)
6. [Facility Registry](#facility-registry)
7. [Facility Requests (Change Workflows)](#facility-requests-change-workflows)
8. [Data Sources](#data-sources)
9. [Location Reconciliation (Matching)](#location-reconciliation-matching)
10. [Configuration](#configuration)
11. [Location Utilities](#location-utilities)
12. [Sync](#sync)
13. [Apps](#apps)
14. [Progress Tracking](#progress-tracking)
15. [Error Responses](#error-responses)

---

## Authentication

GoFR supports two identity providers (IDPs): **`gofr`** (built-in) and **`keycloak`**.

### POST `/auth/login`

Authenticate with email and password (session-based login for browser clients).

**Request body** (`application/x-www-form-urlencoded` or JSON):

| Field      | Type   | Required | Description            |
|------------|--------|----------|------------------------|
| `username` | string | Yes      | User e-mail address    |
| `password` | string | Yes      | User password          |

**Response `200 OK`:**

```json
{
  "oK": true,
  "userObj": { ... }
}
```

**Response `401 Unauthorized`:** Invalid credentials.

---

### POST `/auth/token`

Obtain a JWT access token for **API / machine-to-machine** access. The token must be sent in subsequent requests via the `Authorization: Bearer <token>` header.

**Request body** (JSON):

| Field      | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| `username` | string | Yes      | User e-mail address |
| `password` | string | Yes      | User password       |

**Response `200 OK`:**

```json
{
  "access_token": "<jwt>"
}
```

**Response `401 Unauthorized`:** Invalid credentials.

---

### GET `/auth/logout`

Invalidates the current session (session-based clients).

**Response `200 OK`:**

```json
{ "ok": true }
```

---

### GET `/auth`

Returns the current authenticated user object and their permissions, or a `{ ok: true }` when using the logged-out guest session.

**Response `200 OK`:**

```json
{
  "userObj": { ... }
}
```

---

### OAuth2 / Google (browser flow only)

| Method | Path                     | Description                                |
|--------|--------------------------|--------------------------------------------|
| `GET`  | `/auth/google`           | Redirects to Google OAuth2 consent screen  |
| `GET`  | `/auth/google/callback`  | OAuth2 callback — redirects to `/` on success |

---

## Session

### GET `/isSessionActive`

Lightweight endpoint to check whether the server is reachable and the session cookie is valid. No authentication required.

**Response `200 OK`:** `true`

---

## Users & Roles

All endpoints under `/users` require authentication.

### GET `/users/getRoles`

Returns all roles defined in the system.

**Response `200 OK`:**

```json
[
  {
    "id": "gofr-role-admin",
    "name": "Admin",
    "tasks": ["gofr-task-read-location", "..."]
  }
]
```

---

### GET `/users/getUsers`

Returns all registered users.

**Response `200 OK`:**

```json
[
  {
    "id": "person-uuid",
    "userName": "user@example.com",
    "fullName": "Jane Doe"
  }
]
```

---

### POST `/users/addDhis2User`

Creates or updates a GoFR user account from a DHIS2 user record. Intended for DHIS2 integration.

**Request body** (JSON):

| Field               | Type     | Required | Description                      |
|---------------------|----------|----------|----------------------------------|
| `id`                | string   | Yes      | DHIS2 user UUID                  |
| `firstName`         | string   | Yes      | Given name                       |
| `surname`           | string   | Yes      | Family name                      |
| `username`          | string   | Yes      | DHIS2 username (used as e-mail)  |
| `organisationUnits` | object[] | Yes      | Array of `{ id }` org-unit refs  |

**Response `200 OK`:** Returns the created FHIR `Person` resource wrapper.

---

## FHIR Resources

GoFR proxies FHIR R4 operations to the underlying HAPI FHIR server with permission enforcement. All routes require authentication and appropriate permissions.

> **Partition** — GoFR partitions data by logical tenant. Use `DEFAULT` for the primary registry or a custom partition name for reconciliation data sources.

### GET `/fhir/:partition/:resource/:id?`

Read a single resource or search a resource type.

| Parameter   | Description                                                  |
|-------------|--------------------------------------------------------------|
| `partition` | Data partition name, e.g. `DEFAULT`                          |
| `resource`  | FHIR resource type, e.g. `Location`, `Organization`         |
| `id`        | *(optional)* Resource ID — omit to perform a search         |

**Search query parameters:** Any valid FHIR search parameters for the resource type are forwarded to HAPI FHIR (e.g. `name`, `_count`, `_id`, `_include`).

**Response `200 OK`:** A FHIR resource or FHIR Bundle.

---

### POST `/fhir/:partition/:resource`

Create a new FHIR resource.

**Request body:** A valid FHIR resource JSON object.

**Response `201 Created`:** The created resource (with server-assigned `id` and `meta`).

---

### PUT `/fhir/:partition/:resource/:id`

Update (replace) a FHIR resource.

**Request body:** A complete FHIR resource JSON object including `id`.

**Response `200 OK`:** The updated resource.

---

### PATCH `/fhir/:partition/CodeSystem/:id/:code`

Add or update a single concept in a CodeSystem, and automatically increments the version of all referencing ValueSets.

| Parameter | Description                         |
|-----------|-------------------------------------|
| `id`      | CodeSystem resource ID              |
| `code`    | The concept code to add/update      |

**Request body:** A FHIR `concept` object:

```json
{
  "code": "facility-type-01",
  "display": "Health Centre",
  "definition": "Level 3 health centre"
}
```

**Response `200 OK`:** `{ "ok": true }`

---

### GET `/fhir/:partition/ValueSet/:id/$expand`

Expand a ValueSet.

**Query parameters:** Standard FHIR `$expand` parameters (e.g. `filter`, `count`, `offset`).

**Response `200 OK`:** An expanded FHIR ValueSet.

---

### GET `/fhir/:partition/CodeSystem/$lookup`

Perform a CodeSystem `$lookup` operation.

**Query parameters:** `system`, `code`, `version`, `display`

**Response `200 OK`:** FHIR Parameters response.

---

### GET `/fhir/:partition/DocumentReference/:id/$html`

Retrieve a DocumentReference rendered as sanitized HTML. Supports Markdown content types.

**Response `200 OK`:**

```json
{
  "title": "Document Title",
  "html": "<div>...</div>"
}
```

---

### GET `/fhir/:partition/$short-name`

Resolve a human-readable display name for a FHIR reference or code.

**Query parameters:**

| Parameter   | Description                                                    |
|-------------|----------------------------------------------------------------|
| `reference` | *(option A)* A `ResourceType/id` reference string             |
| `system`    | *(option B)* CodeSystem URL to look up                        |
| `code`      | Code value (used with `system`)                               |
| `valueset`  | ValueSet URL (optional, used together with `system`/`code`)   |

**Response `200 OK`:**

```json
{ "display": "Name of the referenced resource or code" }
```

---

## Questionnaire

### POST `/fhir/:partition/QuestionnaireResponse`

Submit a completed Questionnaire response. GoFR processes the response through its questionnaire engine and persists the resulting FHIR resources (e.g. Location, Organization).

**Request body:** A FHIR `QuestionnaireResponse` resource.

**Response `200 OK`:** The bundle of created/updated resources.

**Response `400 Bad Request`:** Invalid input.

**Example — Submit a Facility Add QuestionnaireResponse:**

```json
{
  "resourceType": "QuestionnaireResponse",
  "questionnaire": "http://gofr.org/fhir/Questionnaire/gofr-facility-questionnaire",
  "status": "completed",
  "item": [
    {
      "linkId": "name",
      "answer": [{ "valueString": "District Hospital A" }]
    },
    {
      "linkId": "status",
      "answer": [{ "valueCoding": { "code": "active" } }]
    }
  ]
}
```

---

### GET `/config/questionnaire/:questionnaire`

Retrieve a compiled Vue.js component template for a given Questionnaire. Primarily used by the GoFR GUI.

| Parameter       | Description              |
|-----------------|--------------------------|
| `questionnaire` | Questionnaire resource ID |

**Response `200 OK`:** HTML/Vue template string.

---

## Facility Registry

These endpoints operate on the primary mCSD-compliant facility registry.

### GET `/FR/getTree`

Returns the full location hierarchy as a tree structure.

**Query parameters:**

| Parameter          | Type    | Description                                            |
|--------------------|---------|--------------------------------------------------------|
| `sourceLimitOrgId` | string  | *(optional)* Root Organization ID to limit the tree   |
| `includeBuilding`  | boolean | *(optional)* Whether to include facility-level nodes  |

**Response `200 OK`:**

```json
{
  "text": "Root Organisation",
  "id": "org-uuid",
  "children": [
    { "text": "Province A", "id": "loc-uuid-1", "children": [...] }
  ]
}
```

---

### GET `/FR/getLocationNames`

Resolve names for a list of location IDs.

**Query parameters:**

| Parameter | Type     | Description                            |
|-----------|----------|----------------------------------------|
| `ids`     | string[] | Array of Location resource IDs         |

**Response `200 OK`:**

```json
[
  { "id": "loc-uuid", "name": "District Hospital" }
]
```

---

### GET `/FR/getBuildings`

List facilities (buildings) with optional filtering.

**Query parameters:**

| Parameter         | Type   | Description                                                               |
|-------------------|--------|---------------------------------------------------------------------------|
| `jurisdiction`    | string | Parent jurisdiction Location ID                                           |
| `action`          | string | `view` (default) or `request` for pending change requests                |
| `requestType`     | string | `add` or `update` (when `action=request`)                                 |
| `requestCategory` | string | `requestsList` to list pending requests                                   |
| `requestedUser`   | string | Filter requests by user ID                                                |

**Response `200 OK`:**

```json
[
  {
    "id": "facility-uuid",
    "name": "Health Centre",
    "code": "HC-001",
    "type": { "code": "hc", "text": "Health Centre" },
    "status": { "code": "active", "text": "Functional" },
    "lat": -1.2345,
    "long": 36.789,
    "phone": "+1234567890",
    "email": "info@hc.example",
    "parent": { "id": "dist-uuid", "name": "District A" },
    "ownership": { "code": "gov", "text": "Government" }
  }
]
```

---

### GET `/FR/getServices`

List healthcare services.

**Query parameters:**

| Parameter     | Type    | Description                              |
|---------------|---------|------------------------------------------|
| `id`          | string  | *(optional)* Filter by HealthcareService ID |
| `getResource` | boolean | Return the raw FHIR resource if `true`   |

**Response `200 OK`:**

```json
[
  {
    "id": "svc-uuid",
    "name": "Antenatal Care",
    "code": "ANC",
    "locations": 12,
    "type": ["Primary Care"],
    "active": "Yes"
  }
]
```

---

### GET `/FR/getCodeSystem`

Retrieve all concepts in a CodeSystem by type.

**Query parameters:**

| Parameter        | Type   | Description                              |
|------------------|--------|------------------------------------------|
| `codeSystemType` | string | Type key configured in `levelMaps`       |

**Response `200 OK`:** Array of FHIR `concept` objects.

---

### POST `/FR/addJurisdiction`

Add a new jurisdiction (administrative boundary) to the registry.

**Request body** (JSON):

| Field    | Type   | Required | Description                     |
|----------|--------|----------|---------------------------------|
| `name`   | string | Yes      | Jurisdiction name               |
| `parent` | string | No       | Parent Location ID              |
| `type`   | object | No       | Location type coding            |

**Response `200 OK`:** Empty body on success.

---

### POST `/FR/addBuilding`

Add a new facility (building) to the registry.

**Request body** (JSON):

| Field                  | Type   | Required | Description                      |
|------------------------|--------|----------|----------------------------------|
| `name`                 | string | Yes      | Facility name                    |
| `parent`               | string | Yes      | Parent jurisdiction Location ID  |
| `status`               | string | No       | `active`, `inactive`, `suspended`|
| `lat`                  | number | No       | Latitude                         |
| `long`                 | number | No       | Longitude                        |
| `phone`                | string | No       | Phone number                     |
| `email`                | string | No       | Email address                    |

**Response `200 OK`:** Empty body on success.

---

### POST `/FR/addService`

Add a new healthcare service.

**Request body** (JSON): Fields matching the FHIR `HealthcareService` resource.

**Response `200 OK`:** Empty body on success.

---

### POST `/FR/addCodeSystem`

Add a new concept to a CodeSystem.

**Request body** (JSON): Fields matching the CodeSystem concept structure.

**Response `200 OK`:** Empty body on success.

---

### POST `/FR/changeBuildingRequestStatus`

Change the status of a pending facility change request.

**Request body** (JSON):

| Field         | Type   | Required | Description                               |
|---------------|--------|----------|-------------------------------------------|
| `id`          | string | Yes      | Location resource ID                      |
| `status`      | string | Yes      | `approved` or `rejected`                  |
| `requestType` | string | Yes      | `add` or `update`                         |

**Response `200 OK`:** Empty body on success.

---

## Facility Requests (Change Workflows)

These endpoints manage approval workflows for facility add/update requests.

### POST `/facilitiesRequests/add`

Approve or reject a **new facility** request.

**Request body** (JSON):

| Field                      | Type   | Required | Description                                        |
|----------------------------|--------|----------|----------------------------------------------------|
| `requestStatus`            | string | Yes      | `approved` or `rejected`                           |
| `resource`                 | object | Yes      | The pending Location FHIR resource                 |
| `profile`                  | string | Yes      | Current (request) profile URL                      |
| `requestUpdatingResource`  | string | Yes      | Target (approved) profile URL                      |

**Response `200 OK`:** Empty body on success.

---

### POST `/facilitiesRequests/update`

Approve or reject a **facility update** request. When approved, the changes are merged into the live Location resource.

**Request body** (JSON):

| Field           | Type   | Required | Description                                   |
|-----------------|--------|----------|-----------------------------------------------|
| `requestStatus` | string | Yes      | `approved` or `rejected`                      |
| `resource`      | object | Yes      | The pending Location FHIR resource            |

**Response `200 OK`:** Empty body on success.

---

## Data Sources

Data sources are external facility lists (DHIS2, FHIR servers, CSV uploads) that can be reconciled against the primary registry.

### GET `/datasource/getSource/:userID/:orgId?`

List all data sources visible to a user.

| Parameter | Description                                     |
|-----------|-------------------------------------------------|
| `userID`  | Person resource ID                              |
| `orgId`   | *(optional)* Organisation ID for DHIS2 users   |

**Response `200 OK`:**

```json
{
  "sources": [
    {
      "id": "basic-uuid",
      "name": "DHIS2 MoH",
      "sourceType": "DHIS2",
      "host": "https://play.dhis2.org",
      "lastUpdate": "2025-04-01T00:00:00"
    }
  ]
}
```

---

### GET `/datasource/getSourceDetails/:partitionID`

Get full details of a data source including sharing configuration.

**Response `200 OK`:**

```json
{
  "generatedFrom": [],
  "shareToAll": { "activated": false, "limitByUserLocation": false },
  "sharedUsers": [
    {
      "id": "person-uuid",
      "name": "Jane Doe",
      "limits": [],
      "permissions": [...]
    }
  ]
}
```

---

### POST `/datasource/addSource`

Register a new data source.

**Required permission:** `add-data-source`

**Request body** (JSON):

| Field                | Type    | Required | Description                                              |
|----------------------|---------|----------|----------------------------------------------------------|
| `name`               | string  | Yes      | Display name                                             |
| `userID`             | string  | Yes      | Owner Person ID                                          |
| `orgId`              | string  | No       | Organisation ID                                          |
| `sourceType`         | string  | No       | `FHIR`, `DHIS2`, or `upload`                            |
| `host`               | string  | No       | Server URL (for FHIR/DHIS2 sources)                     |
| `username`           | string  | No       | Remote username                                          |
| `password`           | string  | No       | Remote password (stored encrypted)                       |
| `shareToSameOrgid`   | boolean | No       | Auto-share to users with the same org ID                |
| `shareToAll`         | boolean | No       | Share with all users                                     |
| `limitByUserLocation`| boolean | No       | Restrict shared access by user's location boundary      |
| `levelData`          | object  | No       | JSON object mapping hierarchy levels                     |
| `partitionID`        | string  | No       | Use an existing partition ID instead of creating one     |

**Response `200 OK`:**

```json
{ "status": "done", "password": "<encrypted>" }
```

---

### POST `/datasource/editSource`

Update an existing data source.

**Required permission:** `adddatasource`

**Request body** (JSON): Same fields as `addSource` plus `id` (the Basic resource ID).

**Response `200 OK`:** `{ "status": "done" }`

---

### DELETE `/datasource/deleteDataSource/:id`

Delete a data source and its underlying HAPI partition.

**Required permission:** `delete-data-source`

**Response `200 OK`:** Empty body on success.

---

### GET `/datasource/countLevels`

Returns the number of administrative hierarchy levels in a data source partition.

**Query parameters:**

| Parameter   | Description                     |
|-------------|---------------------------------|
| `partition` | Data source partition name      |

**Response `200 OK`:** `{ "totalLevels": 4 }`

---

### POST `/datasource/createSourcePair`

Create a reconciliation pair from two data sources.

**Required permission:** `create-source-pair`

**Request body** (JSON):

| Field       | Type    | Required | Description                                          |
|-------------|---------|----------|------------------------------------------------------|
| `source1`   | string  | Yes      | JSON-stringified `{ id, display }` for source 1     |
| `source2`   | string  | Yes      | JSON-stringified `{ id, display }` for source 2     |
| `name`      | string  | Yes      | Pair display name                                    |
| `userID`    | string  | Yes      | Owner Person ID                                      |
| `singlePair`| boolean | No       | Enforce single-pair limit per user                   |
| `dhis2OrgId`| string  | No       | DHIS2 org ID for the owner                           |
| `orgId`     | string  | No       | GoFR Organisation ID                                 |

**Response `200 OK`:** Level mapping objects for both sources.

---

### GET `/datasource/getSourcePair/:userID/:dhis2OrgId?`

List all source pairs accessible to a user.

**Required permission:** `get-source-pair`

**Response `200 OK`:** Array of pair objects with `source1`, `source2`, `status`, `sharedUsers`, `activeUsers`.

---

### GET `/datasource/getPairForSource/:datasource`

List all pairs that include a given data source (as source1 or source2).

**Response `200 OK`:**

```json
[
  { "source1Name": "MoH DHIS2", "source2Name": "GoFR Registry", "owner": { "id": "..." } }
]
```

---

### POST `/datasource/shareSourcePair`

Share a source pair with additional users.

**Required permission:** `share-source-pair`

**Request body** (JSON):

| Field              | Type    | Required | Description                                      |
|--------------------|---------|----------|--------------------------------------------------|
| `sharePair`        | string  | Yes      | Source pair Basic resource ID                    |
| `users`            | string  | Yes      | JSON-stringified array of Person IDs             |
| `permissions`      | string  | Yes      | JSON-stringified permissions object              |
| `userID`           | string  | Yes      | Requesting user's Person ID                      |
| `shareToSameOrgid` | boolean | No       | Share to users in same org automatically         |
| `limitLocationId`  | string  | No       | Restrict shared user's view to this Location ID  |

**Response `200 OK`:** Updated list of pairs.

---

### POST `/datasource/activatePair`

Set a source pair as the active pair for a user.

**Required permission:** `activate-source-pair`

**Request body** (JSON): `{ "id": "<Basic resource ID>", "userID": "<Person ID>" }`

**Response `200 OK`:** Empty body.

---

### POST `/datasource/activateSharedPair`

Mark a shared pair as active for a user.

**Required permission:** `activate-source-pair`

**Request body** (JSON): `{ "pairID": "<Basic resource ID>", "userID": "<Person ID>" }`

**Response `200 OK`:** Empty body.

---

### POST `/datasource/resetDataSourcePair/:userID`

Deactivate all pairs for a user.

**Required permission:** `deactivate-source-pair`

**Response `200 OK`:** Empty body.

---

### DELETE `/datasource/deleteSourcePair`

Delete a source pair.

**Required permission:** `delete-source-pair`

**Query parameters:**

| Parameter    | Description                       |
|--------------|-----------------------------------|
| `pairId`     | Basic resource ID of the pair     |
| `userID`     | Person ID of the requesting user  |
| `pairOwner`  | Person ID of the pair owner       |
| `source1Name`| Name of source 1                  |
| `source2Name`| Name of source 2                  |

**Response `200 OK`:** Empty body.

---

### POST `/datasource/updatePermissions`

Update permissions on a data source partition.

**Response `200 OK`:** Empty body.

---

### POST `/datasource/updateDatasetAutosync`

Enable or disable automatic synchronisation for a data source.

**Request body** (JSON): `{ "id": "<Basic resource ID>", "enabled": true|false }`

**Response `200 OK`:** Empty body.

---

## Location Reconciliation (Matching)

Reconciliation (matching) allows comparing two data sources and mapping equivalent locations.

### GET `/match/reconcile`

Run the reconciliation scoring algorithm for a given level.

**Required permission:** `data-source-reconciliation`

**Query parameters:**

| Parameter            | Type    | Required | Description                                                   |
|----------------------|---------|----------|---------------------------------------------------------------|
| `partition1`         | string  | Yes      | Source 1 partition name                                       |
| `partition2`         | string  | Yes      | Source 2 partition name                                       |
| `mappingPartition`   | string  | Yes      | Mapping (output) partition name                               |
| `recoLevel`          | integer | Yes      | Hierarchy level to reconcile (2 = top administrative level)   |
| `totalSource1Levels` | integer | Yes      | Total hierarchy levels in source 1                            |
| `totalSource2Levels` | integer | Yes      | Total hierarchy levels in source 2                            |
| `clientId`           | string  | Yes      | Unique client ID for progress polling                         |
| `id`                 | string  | No       | Existing mapping partition ID                                 |
| `source1LimitOrgId`  | string  | No       | JSON array of source 1 root Org IDs                           |
| `source2LimitOrgId`  | string  | No       | JSON array of source 2 root Org IDs                           |
| `parentConstraint`   | boolean | No       | Enforce parent matching constraint                            |
| `getPotential`       | boolean | No       | Include potential matches in results                          |
| `orgid`              | string  | No       | Filter by Organisation ID                                     |

**Response `200 OK`:** Empty (results retrieved via `/progress`).

---

### GET `/match/recoStatus/:pairId`

Get the current reconciliation status of a source pair.

**Required permission:** `view-matching-status`

**Response `200 OK`:**

```json
{ "status": "in-progress" }
```

Possible values: `in-progress`, `Done`.

---

### GET `/match/markRecoDone/:pairId`

Mark a reconciliation session as completed. Optionally sends a webhook notification.

**Required permission:** `close-matching`

**Response `200 OK`:** `{ "status": "Done" }`

---

### GET `/match/markRecoUnDone/:pairId`

Re-open a completed reconciliation session.

**Required permission:** `open-matching`

**Response `200 OK`:** `{ "status": "in-progress" }`

---

### GET `/match/matchedLocations`

Retrieve matched location pairs.

**Required permission:** implicitly via session

**Query parameters:**

| Parameter          | Type   | Required | Description                                        |
|--------------------|--------|----------|----------------------------------------------------|
| `partition1`       | string | Yes      | Source 1 partition name                            |
| `partition2`       | string | Yes      | Source 2 partition name                            |
| `mappingPartition` | string | Yes      | Mapping partition name                             |
| `type`             | string | Yes      | `FHIR` (returns a Bundle) or `CSV` (tabular)       |
| `levelMapping1`    | string | No       | JSON-stringified level-to-level mapping for source 1 |
| `levelMapping2`    | string | No       | JSON-stringified level-to-level mapping for source 2 |
| `source1LimitOrgId`| string | No       | Root Org ID for source 1                           |
| `source2LimitOrgId`| string | No       | Root Org ID for source 2                           |

**Response `200 OK`:** FHIR Bundle or CSV download depending on `type`.

---

### GET `/match/unmatchedLocations`

Retrieve unmatched locations from source 1.

**Query parameters:** Same partition and limit parameters as `/match/matchedLocations`.

**Response `200 OK`:** FHIR Bundle of unmatched Location resources.

---

### POST `/match/performMatch/:type`

Manually confirm a match between two locations.

**Required permission:** `match-location`

| URL Parameter | Description                            |
|---------------|----------------------------------------|
| `type`        | `flag` (flag for review) or `match`    |

**Request body** (JSON):

| Field              | Type   | Required | Description                            |
|--------------------|--------|----------|----------------------------------------|
| `pairId`           | string | Yes      | Source pair Basic resource ID          |
| `partition1`       | string | Yes      | Source 1 partition name                |
| `partition2`       | string | Yes      | Source 2 partition name                |
| `mappingPartition` | string | Yes      | Mapping partition name                 |
| `source1Id`        | string | Yes      | Source 1 Location ID                   |
| `source2Id`        | string | Yes      | Source 2 Location ID                   |
| `recoLevel`        | integer| Yes      | Hierarchy level                        |
| `totalLevels`      | integer| Yes      | Total levels                           |
| `flagComment`      | string | No       | Comment when flagging                  |

**Response `200 OK`:** `{ "matchComments": "..." }`

---

### POST `/match/noMatch/:type`

Mark a source 1 location as having no match in source 2.

**Required permission:** `match-location`

**Request body** (JSON): Same as `performMatch` except `source2Id` is not required.

**Response `200 OK`:** Empty body.

---

### POST `/match/acceptFlag/:mappingPartition`

Accept a flagged location pair as a confirmed match.

**Required permission:** `accept-flagged-location`

**Request body** (JSON): `{ "pairId": "...", "source1Id": "..." }`

**Response `200 OK`:** Empty body.

---

### POST `/match/breakMatch`

Remove a confirmed match, returning both locations to unmatched state.

**Required permission:** `break-matched-location`

**Request body** (JSON):

| Field              | Type   | Required | Description               |
|--------------------|--------|----------|---------------------------|
| `pairId`           | string | Yes      | Source pair ID            |
| `source1Id`        | string | Yes      | Source 1 Location ID      |
| `mappingPartition` | string | Yes      | Mapping partition name    |
| `partition1`       | string | Yes      | Source 1 partition name   |

**Response `200 OK`:** Empty body.

---

### POST `/match/breakNoMatch/:type`

Remove a no-match designation.

**Required permission:** `break-matched-location`

**Request body** (JSON): `{ "pairId": "...", "source1Id": "...", "mappingPartition": "..." }`

**Response `200 OK`:** Empty body.

---

## Configuration

### GET `/config/page/:page/:type?`

Retrieve a compiled Vue.js page definition for a given profile-based page.

| Parameter | Description                                    |
|-----------|------------------------------------------------|
| `page`    | GoFR Page resource ID                          |
| `type`    | *(optional)* `mine`, `shared`, or `external`   |

**Response `200 OK`:** Page component HTML/metadata object.

---

### GET `/config/getUserConfig/:userID`

Retrieve user-specific application configuration.

**Response `200 OK`:**

```json
{
  "config": { ... },
  "site": { ... }
}
```

---

### POST `/config/updateUserConfig/:userID`

Save user-specific application configuration.

**Request body** (JSON):

| Field    | Type          | Description                       |
|----------|---------------|-----------------------------------|
| `config` | string/object | Serialised user config object     |

**Response `200 OK`:** `{ "status": "Done" }`

---

### GET `/config/getGeneralConfig`

Retrieve system-wide general configuration. Does **not** require authentication.

**Query parameters:**

| Parameter            | Description                                   |
|----------------------|-----------------------------------------------|
| `defaultGenerConfig` | JSON-stringified default config to merge with |

**Response `200 OK`:** Configuration object.

---

### POST `/config/updateGeneralConfig`

Save system-wide general configuration.

**Required permission:** admin

**Request body** (JSON):

| Field    | Type          | Description                             |
|----------|---------------|-----------------------------------------|
| `config` | string/object | Serialised general config object        |

**Response `200 OK`:** `{ "status": "Done" }`

---

## Location Utilities

### GET `/hierarchy`

Paginated flat grid of locations in a partition, suitable for tabular display.

**Query parameters:**

| Parameter          | Type    | Description                                                   |
|--------------------|---------|---------------------------------------------------------------|
| `partition`        | string  | Data partition name                                           |
| `id`               | string  | *(optional)* Root location ID                                 |
| `sourceLimitOrgId` | string  | *(optional)* Top org ID to limit results                      |
| `start`            | integer | Pagination offset                                             |
| `count`            | integer | Page size                                                     |

**Response `200 OK`:**

```json
{ "grid": [...], "total": 253 }
```

---

### GET `/getTree/:partition/:sourceLimitOrgId?`

Full location tree for a partition.

**Response `200 OK`:** Nested tree object (same structure as `/FR/getTree`).

---

### GET `/getLevelData/:source/:sourceOwner/:level`

Flat list of locations at a specific hierarchy level.

| Parameter     | Description                                     |
|---------------|-------------------------------------------------|
| `source`      | Data source name                                |
| `sourceOwner` | Owner user ID                                   |
| `level`       | Numeric hierarchy level                         |

**Response `200 OK`:**

```json
[
  { "text": "Province A", "value": "loc-uuid" }
]
```

---

### GET `/getImmediateChildren/:source/:sourceOwner/:parentID?`

List immediate child jurisdictions (not facilities) of a location.

**Response `200 OK`:**

```json
{
  "children": [
    { "id": "loc-uuid", "name": "District A", "children": [] }
  ]
}
```

---

### GET `/uploadAvailable/:source1/:source2`

Check whether data has been uploaded for both sources of a reconciliation pair.

**Response `200 OK`:**

```json
{ "dataUploaded": true }
```

---

### POST `/editLocation`

Update the name or parent of a location in a data source.

**Request body** (JSON):

| Field          | Type   | Required | Description                  |
|----------------|--------|----------|------------------------------|
| `source`       | string | Yes      | Data source name             |
| `sourceOwner`  | string | Yes      | Owner user ID                |
| `locationId`   | string | Yes      | Location resource ID         |
| `locationName` | string | Yes      | New name                     |
| `locationParent`| string| No       | New parent Location ID       |

**Response `200 OK`:** Empty body.

---

### GET `/mappingStatus/:source1/:source2/:source1Owner/:source2Owner/:level/:totalSource2Levels/:totalSource1Levels/:clientId/:userID`

Trigger mapping status calculation (results available via `/progress`).

---

## Sync

### POST `/dhisSync`

Trigger a DHIS2 data synchronisation into a GoFR data source partition.

**Request body** (JSON):

| Field      | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `host`     | string | Yes      | DHIS2 server URL                     |
| `username` | string | Yes      | DHIS2 username                       |
| `password` | string | Yes      | DHIS2 password                       |
| `name`     | string | Yes      | GoFR data source name                |
| `clientId` | string | Yes      | Client ID for progress polling       |
| `mode`     | string | No       | `full` (default) or `update`         |

**Response `200 OK`:** Empty (operation runs asynchronously; poll `/progress`).

---

### POST `/fhirSync`

Trigger synchronisation from an external FHIR server into a GoFR data source partition.

**Request body** (JSON):

| Field      | Type   | Required | Description                          |
|------------|--------|----------|--------------------------------------|
| `id`       | string | Yes      | Data source Basic resource ID        |
| `host`     | string | Yes      | Remote FHIR server base URL          |
| `username` | string | No       | Basic auth username                  |
| `password` | string | No       | Basic auth password                  |
| `mode`     | string | No       | `full` or `update`                   |
| `name`     | string | Yes      | GoFR data source name                |
| `clientId` | string | Yes      | Client ID for progress polling       |

**Response `200 OK`:** Empty (operation runs asynchronously; poll `/progress`).

---

### POST `/uploadCSV`

Upload a CSV file to create a data source partition.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field      | Type   | Required | Description                              |
|------------|--------|----------|------------------------------------------|
| `csvName`  | string | Yes      | Data source name                         |
| `userID`   | string | Yes      | Owner Person ID                          |
| `clientId` | string | Yes      | Client ID for progress polling           |

**File field:** `csvFile` — The CSV file to upload.

**Response `200 OK`:** Empty (operation runs asynchronously; poll `/progress`).

---

### GET `/getUploadedCSV/:sourceOwner/:name`

Download the most recently uploaded CSV for a data source.

**Response `200 OK`:** CSV file content.

---

## Apps

GoFR supports plugin applications (iHRIS-style apps distributed as `.zip` files).

### GET `/apps/installed`

List all installed apps with metadata.

**Response `200 OK`:**

```json
[
  {
    "name": "My App",
    "app_short_name": "my-app",
    "iconBase64": "data:image;base64,..."
  }
]
```

---

### POST `/apps/install`

Install an app from a `.zip` file upload.

**Content-Type:** `multipart/form-data`

**File field:** `app` — The `.zip` archive. Must contain a `manifest.webapp` file with a `name` property.

**Response `200 OK`:** Parsed `manifest.webapp` object.

**Response `400 Bad Request`:** Invalid archive or missing manifest.

---

### DELETE `/apps/uninstall/:name`

Remove an installed app.

| Parameter | Description              |
|-----------|--------------------------|
| `name`    | App short name (directory name) |

**Response `200 OK`:** `{}`

---

## Progress Tracking

Long-running operations (sync, reconciliation, CSV upload) store progress in Redis and can be polled.

### GET `/progress/:type/:clientId`

Poll the progress of a background operation.

| Parameter  | Description                                                          |
|------------|----------------------------------------------------------------------|
| `type`     | Operation type prefix, e.g. `uploadProgress`, `scoreResults`, `mappingStatus` |
| `clientId` | The `clientId` provided when starting the operation                  |

**Response `200 OK`:**

```json
{
  "status": "2/3 - Matching locations",
  "error": null,
  "percent": 67,
  "responseData": null
}
```

Fields are `null` until the operation begins writing progress updates.

---

### GET `/clearProgress/:type/:clientId`

Reset progress data for an operation.

**Response `200 OK`:** Empty body.

---

## Error Responses

GoFR uses standard HTTP status codes. Error bodies follow FHIR OperationOutcome or simple JSON patterns.

| Status | Meaning                                              |
|--------|------------------------------------------------------|
| `400`  | Bad request — missing or invalid parameters          |
| `401`  | Unauthenticated — no valid session or token          |
| `403`  | Forbidden — insufficient permissions                 |
| `404`  | Resource not found                                   |
| `500`  | Internal server error                                |

**FHIR OperationOutcome (permission denied):**

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "forbidden",
    "diagnostics": "Access Denied"
  }]
}
```

**FHIR OperationOutcome (server error):**

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "exception",
    "diagnostics": "<error detail>"
  }]
}
```

---

## Authorisation Model

GoFR uses a role-based permission system backed by FHIR `Basic` resources. Each permission check tests one of:

- **Named permission** — `hasPermissionByName(action, resourceType, id?, partition?)` e.g. `read Location`
- **Special permission** — `hasPermissionByName('special', 'custom', '<task>')` e.g. `add-data-source`

Permissions are evaluated against the user's assigned roles. Administrators with `*/*` permissions bypass all checks.

### Common Special Tasks

| Task name                       | Used by endpoint                          |
|---------------------------------|-------------------------------------------|
| `add-data-source`               | `POST /datasource/addSource`              |
| `get-data-source`               | `GET /datasource/getSource`               |
| `view-data-source`              | `GET /datasource/getSourceDetails`        |
| `delete-data-source`            | `DELETE /datasource/deleteDataSource`     |
| `create-source-pair`            | `POST /datasource/createSourcePair`       |
| `get-source-pair`               | `GET /datasource/getSourcePair`           |
| `share-source-pair`             | `POST /datasource/shareSourcePair`        |
| `activate-source-pair`          | `POST /datasource/activatePair`           |
| `deactivate-source-pair`        | `POST /datasource/resetDataSourcePair`    |
| `delete-source-pair`            | `DELETE /datasource/deleteSourcePair`     |
| `data-source-reconciliation`    | `GET /match/reconcile`                    |
| `match-location`                | `POST /match/performMatch`, `noMatch`     |
| `accept-flagged-location`       | `POST /match/acceptFlag`                  |
| `break-matched-location`        | `POST /match/breakMatch`, `breakNoMatch`  |
| `open-matching`                 | `GET /match/markRecoUnDone`               |
| `close-matching`                | `GET /match/markRecoDone`                 |
| `view-matching-status`          | `GET /match/recoStatus`                   |
