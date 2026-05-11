# GOFR Architechture

![Alt text](../img/architechture.jpg 'GOFR Architechture')

## Overview

The Global Open Facility Registry (GOFR) is a facility registry and reconciliation platform for managing health facility data from multiple sources. At a high level, GOFR combines a web-based user interface, a Node.js/Express backend API, a FHIR-based persistence layer, and supporting infrastructure for authentication, caching, and background processing.

As shown in the architecture diagram, the platform is organized around a few core responsibilities:

- **Presentation layer** for user interaction through the GOFR GUI.
- **Application layer** implemented in the GOFR backend, where business logic, orchestration, and APIs live.
- **FHIR persistence and interoperability layer** built around HAPI FHIR and the mCSD profile.
- **Integration layer** for ingesting and synchronizing data from CSV files, DHIS2, and other FHIR servers.
- **Supporting services** such as Redis for sessions/progress tracking and an identity provider such as Keycloak or the built-in GOFR authentication mode.

GOFR is therefore not just a registry for storing facilities. It is also a workflow engine for data import, hierarchy management, reconciliation, matching, and controlled sharing of partitions and source pairs.

## Major Components

### GOFR GUI

The GUI is the primary user-facing component. It allows users to:

- manage data sources and source pairs
- browse facility and jurisdiction hierarchies
- upload CSV data
- synchronize from DHIS2 and FHIR endpoints
- review matching suggestions and perform reconciliation
- manage sharing and access to partitions

The GUI communicates with the backend over HTTP APIs exposed by the Express application.

### GOFR Backend

The backend is implemented as an Express application and serves as the main orchestration layer. It mounts route groups for authentication, users, data sources, matching, facility registry operations, configuration, FHIR endpoints, and application extensions. This can be seen in `gofr-backend/lib/app.js`, where routes such as `/users`, `/datasource`, `/match`, `/FR`, `/config`, `/fhir`, and `/facilitiesRequests` are registered.

The backend is responsible for:

- enforcing authentication and authorization
- serving the GUI and application routes
- coordinating data import and synchronization workflows
- managing reconciliation processes
- reading and writing FHIR resources
- tracking long-running task progress in Redis
- exposing helper endpoints for hierarchy traversal and tree generation

### HAPI FHIR Server

GOFR uses HAPI FHIR as the underlying persistence and interoperability layer. The documentation describes GOFR as a GUI on top of HAPI FHIR, and the backend code interacts with the FHIR server through the internal `fhirAxios` abstraction. GOFR stores domain metadata such as data sources, partitions, source pairs, and sharing rules as FHIR resources, especially `Basic` resources with GOFR-specific profiles and extensions.

The FHIR server is also partition-aware. New datasets and reconciliation workspaces are provisioned as partitions, allowing GOFR to isolate source data and mapping data while still using a shared FHIR infrastructure.

### Redis

Redis is used as an operational support component. In the backend it is configured for:

- **session storage** through `connect-redis`
- **progress tracking** for long-running operations such as CSV upload, synchronization, and reconciliation scoring
- **temporary status persistence** for asynchronous workflows

Examples in the backend include progress keys such as `uploadProgress<clientId>`, `scoreResults<clientId>`, and `mappingStatus<clientId>`.

### Identity Provider

GOFR supports multiple authentication modes. The backend checks `app:idp` and can operate with:

- **Keycloak**
- **GOFR built-in authentication**
- **DHIS2-based authentication**

When Keycloak is enabled, backend requests are protected through Keycloak middleware. The installation guide also describes Keycloak as the recommended single sign-on solution when external identity management is required.

## Core Data Model

A central architectural concept in GOFR is that facility registry data is modeled using **FHIR resources aligned to the mCSD profile**.

### mCSD and FHIR resources

GOFR does not treat a facility as a single proprietary record. Instead, it follows mCSD guidance:

- a **Facility** is represented as a pairing of **Location** and **Organization**
- **Jurisdictions** are also modeled as Location and Organization pairs
- **HealthcareService** represents services offered at facilities
- **Practitioner** and **PractitionerRole** represent health workers and their roles
- hierarchical relationships are represented with references such as `partOf`

This model allows GOFR to use standard FHIR interactions while preserving the semantics needed for facility registry and service directory use cases.

### GOFR metadata resources

In addition to core mCSD resources, GOFR stores platform metadata in FHIR using profiled `Basic` resources. The backend code shows profiled resources for concepts such as:

- **data sources**
- **partitions**
- **data source pairs**
- **users and sharing metadata**

These resources carry GOFR-specific extensions such as partition ownership, sharing permissions, source configuration, level mappings, and reconciliation state.

## Architectural Flow

### 1. User access and request handling

A user accesses GOFR through the GUI. Requests are sent to the Express backend, which first applies:

- CORS and request parsing middleware
- session and cookie handling
- authentication checks
- permission checks on route handlers

The backend then dispatches the request to the appropriate route module.

### 2. Data ingestion and partition creation

GOFR organizes imported or managed datasets into **partitions**. A partition acts as the logical workspace for a dataset.

Data can enter the platform from multiple sources:

- **CSV upload**
- **DHIS2 synchronization**
- **FHIR server synchronization**
- **blank/manual sources** documented elsewhere in the user guide

For example:

- CSV uploads go through `/uploadCSV`, where the file is validated, a partition is created in HAPI FHIR, level mapping is derived, and the CSV is converted into mCSD/FHIR data.
- Data source creation through `/datasource/addSource` creates or links a partition and stores a profiled FHIR `Basic` resource describing the source.
- DHIS2 and FHIR synchronization endpoints trigger backend sync logic to transform remote data into GOFR-managed structures.

This is why the architecture diagram should be read as a pipeline: external source systems feed data into the backend, which normalizes the content into the GOFR data model and persists it in FHIR partitions.

### 3. Hierarchy management

Once data is loaded, GOFR provides APIs to work with hierarchical location structures. The backend exposes endpoints for:

- retrieving level data
- generating trees for partitions
- listing immediate children
- constructing tabular hierarchy views

These hierarchy operations depend heavily on the `mcsd` module, which encapsulates logic for retrieving, filtering, and restructuring FHIR Location-based hierarchies.

### 4. Reconciliation and matching

One of GOFR’s most important architectural functions is reconciliation between two data sources.

The reconciliation flow works broadly as follows:

1. Two data sources are paired into a **source pair**.
2. GOFR creates a dedicated **mapping partition** for the pair.
3. The backend loads hierarchical data from both partitions.
4. Scoring logic computes candidate matches for jurisdictions or facilities.
5. Users review and confirm matches, flag uncertain records, or mark records as no match.
6. Match state is persisted in the mapping partition and tracked via GOFR metadata.

The `match.js` route module shows this clearly:

- `/reconcile` loads source data and computes scores
- `/performMatch/:type` saves confirmed matches
- `/noMatch/:type` records deliberate non-matches
- `/breakMatch` and `/breakNoMatch/:type` reopen prior decisions
- `/markRecoDone/:pairId` and `/markRecoUnDone/:pairId` control reconciliation lifecycle state

This makes reconciliation a first-class subsystem rather than a simple comparison utility.

### 5. Sharing and permissions

GOFR supports controlled collaboration by associating permissions with partitions and source pairs. The data source routes show that sharing is stored in partition metadata and can include:

- specific shared users
- resource-level permissions
- optional location-based limits
- share-to-all and same-organization options

This architecture allows the same underlying dataset to be reused across users while preserving access controls.

## Source Code Responsibilities

### `app.js`

`gofr-backend/lib/app.js` is the application entry point and composition root. It:

- initializes middleware
- sets up authentication behavior
- mounts route modules
- exposes utility endpoints for hierarchy and upload workflows
- initializes startup tasks after configuration is loaded

### `routes/dataSources.js`

This route module manages lifecycle operations for data sources and source pairs, including:

- creating and editing data sources
- creating source pairs
- activating and sharing source pairs
- counting levels and retrieving level mapping
- deleting sources and pair partitions

Architecturally, it is the main controller for dataset orchestration and partition metadata management.

### `routes/match.js`

This route module implements reconciliation and match lifecycle operations. It coordinates:

- loading source records for comparison
- invoking scoring logic
- persisting match decisions
- exporting matched and unmatched results
- marking reconciliation as done or in progress

### `mcsd.js`

The `mcsd` module is a foundational domain service. It provides the low-level logic for:

- retrieving mCSD/FHIR data
- traversing hierarchical locations
- filtering records by level or parent
- transforming imported data into GOFR-compatible FHIR structures
- saving and breaking matches

Although the architecture diagram presents components at a higher level, much of the domain behavior is concentrated in this module.

## External Integrations

The architecture also depends on external systems and standards.

### DHIS2

GOFR can synchronize organizational and facility data from DHIS2. The DHIS integration module handles authentication, extraction, and transformation before data is loaded into GOFR-managed partitions.

### External FHIR servers

GOFR can ingest and synchronize data from external FHIR endpoints. This is important for interoperable deployments where facility data already exists in standards-based systems.

### CSV imports

CSV remains a practical onboarding path for many implementations. GOFR validates uploaded files, maps columns to levels, and converts rows into structured hierarchy data backed by FHIR resources.

## Deployment View

Based on the documentation and install artifacts, a typical deployment includes:

- the **GOFR GUI** served by the Node.js application
- the **GOFR backend** running as the API and orchestration service
- a **HAPI FHIR server** backed by PostgreSQL
- **Redis** for sessions and progress state
- optionally **Keycloak** for identity and single sign-on

The Ansible and Docker documentation reinforces this deployment model and shows that GOFR is intended to run as a composed system rather than as a single standalone binary.

## Summary

The architecture diagram represents GOFR as a layered, standards-based facility registry platform.

In practical terms:

- the **GUI** provides the user workflow
- the **backend** coordinates business logic and permissions
- **HAPI FHIR** provides standards-based persistence with partitions
- **mCSD/FHIR resources** define the domain model for facilities, jurisdictions, organizations, and services
- **Redis** supports operational state such as sessions and progress tracking
- **DHIS2, FHIR, and CSV** provide inbound data integration paths
- **source pairs and mapping partitions** enable structured reconciliation workflows

Together, these components allow GOFR to ingest facility data from multiple systems, normalize it into a shared FHIR-based model, reconcile duplicates and mismatches, and expose a controlled collaborative workspace for maintaining a trusted facility registry.
