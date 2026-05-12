#!/usr/bin/env node

/**
 * Script to scan HAPI FHIR server for Locations that are jurisdictions
 * and create corresponding Organization pairs if missing.
 *
 * According to mCSD, jurisdictions are Location + Organization pairs.
 * This script ensures all jurisdiction Locations have a corresponding Organization.
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const FHIR_BASE_URL = process.env.FHIR_BASE_URL || 'http://localhost:8080/fhir/';
const PARTITION = process.env.PARTITION || 'DEFAULT';
const DRY_RUN = process.env.DRY_RUN === 'true';

const fhirClient = axios.create({
  baseURL: `${FHIR_BASE_URL}${PARTITION}/`,
  timeout: 30000,
});

// Utility functions
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function error(message) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

async function searchLocations(query) {
  try {
    const response = await fhirClient.get('Location', { params: query });
    return response.data;
  } catch (err) {
    error(`Failed to search Locations: ${err.message}`);
    throw err;
  }
}

async function readOrganization(id) {
  try {
    const response = await fhirClient.get(`Organization/${id}`);
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    error(`Failed to read Organization ${id}: ${err.message}`);
    throw err;
  }
}

async function createOrganization(locationId, locationName) {
  const orgId = `org-${locationId}`;
  
  const organization = {
    resourceType: 'Organization',
    id: orgId,
    meta: {
      profile: ['http://ihe.net/fhir/StructureDefinition/IHE.mCSD.JurisdictionOrganization'],
    },
    name: locationName,
    type: [
      {
        coding: [
          {
            system: 'urn:ietf:rfc:3986',
            code: 'urn:ihe:iti:mcsd:2019:jurisdiction',
            display: 'Jurisdiction',
          },
        ],
      },
    ],
    active: true,
  };

  try {
    if (DRY_RUN) {
      log(`[DRY RUN] Would create Organization: ${orgId} for Location: ${locationId}`);
      return organization;
    }

    const response = await fhirClient.put(`Organization/${orgId}`, organization);
    log(`Created Organization: ${orgId} for Location: ${locationId}`);
    return response.data;
  } catch (err) {
    error(`Failed to create Organization ${orgId}: ${err.message}`);
    throw err;
  }
}

async function updateLocationWithOrganization(location, organizationId) {
  const updatePayload = { ...location };
  updatePayload.managingOrganization = {
    reference: `Organization/${organizationId}`,
    display: `Managing Organization for ${location.name}`,
  };

  try {
    if (DRY_RUN) {
      log(`[DRY RUN] Would update Location: ${location.id} with managingOrganization: ${organizationId}`);
      return updatePayload;
    }

    const response = await fhirClient.put(`Location/${location.id}`, updatePayload);
    log(`Updated Location: ${location.id} with managingOrganization: ${organizationId}`);
    return response.data;
  } catch (err) {
    error(`Failed to update Location ${location.id}: ${err.message}`);
    throw err;
  }
}

function isJurisdiction(location) {
  // Check physicalType for 'jdn' code
  if (location.physicalType && location.physicalType.coding && location.physicalType.coding[0] && location.physicalType.coding[0].code === 'jdn') {
    return true;
  }

  // Check type for jurisdiction coding
  if (location.type) {
    for (const typeEntry of location.type) {
      if (typeEntry.coding) {
        for (const coding of typeEntry.coding) {
          if (
            coding.system === 'urn:ietf:rfc:3986' &&
            coding.code === 'urn:ihe:iti:mcsd:2019:jurisdiction'
          ) {
            return true;
          }
        }
      }
    }
  }

  // Check profile
  if (location.meta && location.meta.profile && location.meta.profile.includes('http://ihe.net/fhir/StructureDefinition/IHE.mCSD.JurisdictionLocation')) {
    return true;
  }

  return false;
}

async function main() {
  log(`Starting jurisdiction Organization update script`);
  log(`FHIR Base URL: ${FHIR_BASE_URL}`);
  log(`Partition: ${PARTITION}`);
  log(`Dry Run: ${DRY_RUN}`);
  log('---');

  let stats = {
    totalLocations: 0,
    jurisdictionsFound: 0,
    jurisdictionsWithOrg: 0,
    jurisdictionsMissingOrg: 0,
    organizationsCreated: 0,
    locationsUpdated: 0,
    errors: 0,
  };

  try {
    // Get all Locations with pagination
    let pageCount = 1;
    let allLocations = [];
    let nextUrl = null;

    log('Fetching Locations from FHIR server...');

    do {
      let query = { _count: 100 };
      let response;

      if (nextUrl) {
        // Use the 'next' link from Bundle pagination
        response = await fhirClient.get(nextUrl);
      } else {
        response = await fhirClient.get('Location', { params: query });
      }

      if (response.data && response.data.entry) {
        allLocations = allLocations.concat(response.data.entry.map(e => e.resource));
        log(`Fetched ${response.data.entry.length} locations (page ${pageCount})`);
      }

      // Look for 'next' link
      nextUrl = null;
      if (response.data && response.data.link) {
        const nextLink = response.data.link.find(link => link.relation === 'next');
        if (nextLink) {
          nextUrl = nextLink.url;
        }
      }

      pageCount++;
    } while (nextUrl);

    stats.totalLocations = allLocations.length;
    log(`Total Locations fetched: ${stats.totalLocations}`);
    log('---');

    // Process jurisdictions
    log('Scanning for jurisdictions...');

    for (const location of allLocations) {
      if (!isJurisdiction(location)) {
        continue;
      }

      stats.jurisdictionsFound++;
      const hasManagingOrg = location.managingOrganization && location.managingOrganization.reference;

      if (hasManagingOrg) {
        stats.jurisdictionsWithOrg++;
        const orgId = location.managingOrganization.reference.split('/')[1];
        
        // Verify the organization exists
        const org = await readOrganization(orgId);
        if (!org) {
          log(`WARNING: Jurisdiction Location ${location.id} references non-existent Organization ${orgId}`);
          stats.jurisdictionsMissingOrg++;
          
          // Create the missing organization
          try {
            const newOrg = await createOrganization(location.id, location.name);
            await updateLocationWithOrganization(location, newOrg.id);
            stats.organizationsCreated++;
            stats.locationsUpdated++;
          } catch (err) {
            error(`Failed to fix missing Organization for Location ${location.id}`);
            stats.errors++;
          }
        }
      } else {
        stats.jurisdictionsMissingOrg++;
        log(`Jurisdiction Location missing managingOrganization: ${location.id} (${location.name})`);

        try {
          const newOrg = await createOrganization(location.id, location.name);
          await updateLocationWithOrganization(location, newOrg.id);
          stats.organizationsCreated++;
          stats.locationsUpdated++;
        } catch (err) {
          error(`Failed to create/link Organization for Location ${location.id}`);
          stats.errors++;
        }
      }
    }

    log('---');
    log('SUMMARY:');
    log(`  Total Locations scanned: ${stats.totalLocations}`);
    log(`  Jurisdictions found: ${stats.jurisdictionsFound}`);
    log(`  Jurisdictions with Organization: ${stats.jurisdictionsWithOrg}`);
    log(`  Jurisdictions missing Organization: ${stats.jurisdictionsMissingOrg}`);
    log(`  Organizations created: ${stats.organizationsCreated}`);
    log(`  Locations updated: ${stats.locationsUpdated}`);
    log(`  Errors: ${stats.errors}`);
    
    if (DRY_RUN) {
      log('(Dry run - no changes made)');
    }

    // Save report
    const reportFile = `jurisdiction-org-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(stats, null, 2));
    log(`Report saved to: ${reportFile}`);

  } catch (err) {
    error(`Fatal error: ${err.message}`);
    process.exit(1);
  }
}

main().then(() => {
  log('Done.');
  process.exit(0);
}).catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
