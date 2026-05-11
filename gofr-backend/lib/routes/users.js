const crypto = require("crypto");
const fhirpath = require('fhirpath');
const express = require('express');

const router = express.Router();

const logger = require('../winston');
const fhirAxios = require('../modules/fhirAxios');

const ROLE_EXT = 'http://gofr.org/fhir/StructureDefinition/gofr-ext-role';
const ROLE_NAME_EXT = 'http://gofr.org/fhir/StructureDefinition/gofr-basic-name';

router.get('/getRoles', (req, res) => {
  logger.info('Received a request to get roles list');
  fhirAxios.search('Basic', {
    '_profile': 'http://gofr.org/fhir/StructureDefinition/gofr-role',
    '_count': 100,
  }, 'DEFAULT').then((rolesRes) => {
    const roles = [];
    for (const entry of (rolesRes.entry || [])) {
      const resource = entry.resource;
      const roleExt = (resource.extension || []).find(e => e.url === ROLE_EXT);
      if (!roleExt) continue;
      const nameExt = (roleExt.extension || []).find(e => e.url === ROLE_NAME_EXT);
      const name = nameExt ? nameExt.valueString : resource.id;
      const tasks = (roleExt.extension || [])
        .filter(e => e.url === 'task' && e.valueReference && e.valueReference.reference)
        .map(e => e.valueReference.reference.split('/')[1]);
      roles.push({ id: resource.id, name, tasks });
    }
    logger.info(`Returning ${roles.length} roles`);
    return res.status(200).json(roles);
  }).catch((err) => {
    logger.error(err);
    return res.status(500).json({ error: 'Failed to retrieve roles' });
  });
});

router.get('/getUsers', (req, res) => {
  logger.info('received a request to get users lists');
  fhirAxios.search('Person', { }, 'DEFAULT').then((usersRes) => {
    const users = [];
    for (const user of usersRes.entry) {
      const email = fhirpath.evaluate(user.resource, "Person.telecom.where(system='email').value");
      const fullname = fhirpath.evaluate(user.resource, 'Person.name.text');
      // if (!email || !fullname || email.length === 0 || fullname.length === 0) {
      //   continue;
      // }
      users.push({
        id: user.resource.id,
        userName: email[0],
        fullName: fullname[0],
      });
    }
    logger.info(`sending back a list of ${usersRes.entry.length} users`);
    res.status(200).json(users);
  });
});

router.post("/addDhis2User", (req, res) => {
  let salt = crypto.randomBytes(16).toString('hex')
  let hash = hashPassword(req.body.username, salt)
  let orgUnitsIDs = req.body.organisationUnits
  let orgId = orgUnitsIDs.shift().id
  let user = {
    resource: {
      resourceType: "Person",
      id: req.body.id,
      meta: {
        profile: ["http://gofr.org/fhir/StructureDefinition/gofr-person-user"]
      },
      extension: [{
        url: "http://gofr.org/fhir/StructureDefinition/gofr-assign-role",
        valueReference: {
          reference: "Basic/gofr-role-data-manager"
        }
      }, {
        url: "http://gofr.org/fhir/StructureDefinition/gofr-password",
        extension: [
          {
            url: "hash",
            valueString: hash.hash
          },
          {
            url: "salt",
            valueString: salt
          }
        ]
      }, {
        url: "http://gofr.org/fhir/StructureDefinition/dhis2-org-id",
        valueString: orgId
      }],
      name: [{
        text: req.body.firstName + ' ' + req.body.surname
      }],
      telecom: [
        {
          system: "email",
          value: req.body.username
        }
      ],
      active: true
    }
  }
  fhirAxios.update(user.resource, 'DEFAULT').then(() => {
    return res.status(200).json(user)
  }).catch((err) => {
    console.log(err);
    return res.status(500).json(user)
  })
})

function hashPassword( password, salt ) {
  if ( !salt ) {
    salt = crypto.randomBytes(16).toString('hex')
  }
  let hash = crypto.pbkdf2Sync( password, salt, 1000, 64, 'sha512' ).toString('hex')
  return { hash: hash, salt: salt }
}

module.exports = router;
