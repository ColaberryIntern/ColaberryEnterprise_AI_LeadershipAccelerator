const { lookupFixture, lookupGenericFallback } = require('./jurisdictionFixtures');

const ZIPPOPOTAM_URL = 'https://api.zippopotam.us/us';
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveViaApi(zipCode) {
  // Step 1: ZIP → city, state, lat/lng via Zippopotam.us
  const zipRes = await fetchWithTimeout(`${ZIPPOPOTAM_URL}/${zipCode}`, TIMEOUT_MS);
  if (zipRes.status === 404) throw Object.assign(new Error('ZIP code not found'), { code: 'ZIP_NOT_FOUND' });
  if (!zipRes.ok) throw new Error(`Zippopotam error: HTTP ${zipRes.status}`);

  const zipData = await zipRes.json();
  const place = zipData.places?.[0];
  if (!place) throw Object.assign(new Error('No place data for ZIP'), { code: 'ZIP_NOT_FOUND' });

  const lat = parseFloat(place.latitude);
  const lng = parseFloat(place.longitude);
  const city = place['place name'];
  const stateName = place.state;
  const stateAbbr = place['state abbreviation'];

  // Step 2: lat/lng → county + congressional district via Census Geocoder
  let county = null;
  let congressionalDistrict = null;

  try {
    const censusRes = await fetchWithTimeout(
      `${CENSUS_URL}?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=82,86&format=json`,
      TIMEOUT_MS,
    );
    if (censusRes.ok) {
      const censusData = await censusRes.json();
      const geos = censusData?.result?.geographies;
      if (geos) {
        const cd = geos['Congressional Districts']?.[0];
        if (cd) congressionalDistrict = `${stateAbbr}-${cd.BASENAME}`;
        const cty = geos['Counties']?.[0];
        if (cty) county = cty.NAME;
      }
    }
  } catch (err) {
    // Census Geocoder is best-effort — log and continue with partial data
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'detroit-voter-education',
      event: 'census_geocoder_failed',
      error_class: err.constructor.name,
      error: err.message,
    }));
  }

  return {
    zipCode,
    city,
    county,
    stateName,
    stateAbbr,
    congressionalDistrict,
    source: 'api',
    raw: { zippopotam: zipData },
  };
}

// Fixture-first for known Detroit-area ZIPs: instant, zero network dependency,
// so the demo's primary path never depends on Zippopotam/Census being
// reachable. Falls through to the live API for anything not in the fixture
// (real capability for arbitrary ZIP codes is preserved). If the live API
// itself fails and the ZIP looks Detroit-area, a generic fallback answers
// rather than hard-failing -- see jurisdictionFixtures.js for why this is
// safe (real, stable city/county/state facts; congressional district is a
// clearly-labeled best-effort demo value, not verified).
async function resolveZip(zipCode) {
  const fixture = lookupFixture(zipCode);
  if (fixture) {
    return { ...fixture, raw: { source: 'fixture' } };
  }

  try {
    return await resolveViaApi(zipCode);
  } catch (err) {
    if (err.code === 'ZIP_NOT_FOUND') throw err;

    const genericFallback = lookupGenericFallback(zipCode);
    if (genericFallback) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'detroit-voter-education',
        event: 'jurisdiction_api_failed_using_generic_fallback',
        zip_code: zipCode,
        error_class: err.constructor.name,
        error: err.message,
      }));
      return { ...genericFallback, raw: { source: 'fixture-generic', apiError: err.message } };
    }

    throw err;
  }
}

module.exports = { resolveZip };
