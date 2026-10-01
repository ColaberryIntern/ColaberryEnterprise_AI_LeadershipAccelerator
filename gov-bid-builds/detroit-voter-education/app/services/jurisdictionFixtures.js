// Static fallback data so the ZIP -> jurisdiction demo path doesn't depend on
// Zippopotam/Census Geocoder being reachable during a demo (network hiccup,
// rate limit, downtime). City/county/state are real, stable public facts;
// congressional_district is a best-effort demo value, NOT verified against a
// current districting map -- do not rely on it for anything beyond the demo.
// Live API results (resolveZip's normal path) are always preferred when
// reachable; this only fires as a fallback. See STD-004 in the RFP compliance
// matrix for the parallel, already-documented Census-Geocoder-vs-City's-real-
// geocoder deviation this project carries.
const DETROIT_ZIP_FIXTURES = {
  48201: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48202: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48207: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48208: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48209: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-12' },
  48210: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-12' },
  48211: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48213: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48214: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48226: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48227: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
  48228: { city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13' },
};

// Any Detroit-area ZIP (482xx) not in the exact fixture list above still gets
// a plausible generic Detroit/Wayne County answer rather than a hard failure,
// if the live API is also unreachable.
const GENERIC_DETROIT_FALLBACK = {
  city: 'Detroit', county: 'Wayne County', stateName: 'Michigan', stateAbbr: 'MI', congressionalDistrict: 'MI-13',
};

function lookupFixture(zipCode) {
  const exact = DETROIT_ZIP_FIXTURES[zipCode];
  if (exact) {
    return { ...exact, zipCode, source: 'fixture' };
  }
  return null;
}

function lookupGenericFallback(zipCode) {
  if (String(zipCode).startsWith('482')) {
    return { ...GENERIC_DETROIT_FALLBACK, zipCode, source: 'fixture-generic' };
  }
  return null;
}

module.exports = { lookupFixture, lookupGenericFallback, DETROIT_ZIP_FIXTURES };
