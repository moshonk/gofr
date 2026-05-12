const nconf = require('nconf');
const fhirConfig = require('./modules/fhirConfig');
const ihrissmartrequire = require('ihrissmartrequire')

nconf.argv()
  .env({ separator: '__' })
  .file(ihrissmartrequire.path('config/default.json'))
nconf.set('REDIS_HOST', process.env.REDIS_HOST || '127.0.0.1');

nconf.getBool = key => fhirConfig.checkBoolean(nconf.get(key));

const getRetrySetting = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || `${fallback}`, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const REMOTE_CONFIG_RETRY_COUNT = getRetrySetting('GOFR_FHIR_INIT_RETRIES', 24);
const REMOTE_CONFIG_RETRY_DELAY_MS = getRetrySetting('GOFR_FHIR_INIT_RETRY_DELAY_MS', 5000);

const sleep = delay => new Promise((resolve) => setTimeout(resolve, delay));

const isRetriableRemoteConfigError = (err) => {
  if (!err) {
    return false;
  }
  if (err.code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code)) {
    return true;
  }
  if (!err.response || !err.response.status) {
    return true;
  }
  return err.response.status === 404 || err.response.status >= 500;
};

nconf.loadRemote = async () => {
  const fhirAxios = require('./modules/fhirAxios');
  const remoteConfigs = nconf.get('additionalConfig');
  if (remoteConfigs) {
    const configKeys = Object.keys(remoteConfigs);
    const publicKeys = Object.values(nconf.get('keys'));
    for (const conf of configKeys) {
      let loaded = false;
      for (let attempt = 1; attempt <= REMOTE_CONFIG_RETRY_COUNT; attempt += 1) {
        try {
          const response = await fhirAxios.read('Parameters', remoteConfigs[conf], '', 'DEFAULT');
          const newConfig = fhirConfig.parseRemote(response, publicKeys, nconf.getBool('security:disabled'));
          nconf.add(conf, { type: 'literal', store: newConfig });
          loaded = true;
          break;
        } catch (err) {
          if (!isRetriableRemoteConfigError(err) || attempt === REMOTE_CONFIG_RETRY_COUNT) {
            console.error(`Unable to retrieve configuration Parameters ${remoteConfigs[conf]} from FHIR server (${nconf.get('fhir:base')})`);
            console.error(err.message);
            process.exit(1);
          }
          console.warn(`Retrying configuration Parameters ${remoteConfigs[conf]} (${attempt}/${REMOTE_CONFIG_RETRY_COUNT}) after FHIR read error: ${err.message}`);
          await sleep(REMOTE_CONFIG_RETRY_DELAY_MS);
        }
      }
      if (!loaded) {
        process.exit(1);
      }
    }
  }
};
module.exports = nconf;
