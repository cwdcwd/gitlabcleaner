'use strict';

const _ = require('lodash');
const config = require('config');
const logger = require('winston');
const requestPromise = require('request-promise');
const LinkHeader = require('http-link-header');
const inquirer = require('inquirer');

const ui = new inquirer.ui.BottomBar();

const version = 3;
const perPage = 100;
const urlBase = `https://gitlab.com/api/v${version}`;
// /694205/members \.'

/**
 * callOut - description
 *
 * @param  {type} url description
 * @param  {type} headers description
 * @param  {type} cb  description
 */
function callOut(url, headers, cb) {
  if (_.isFunction(headers)) {
    cb = headers;
    headers = {};
  }

  cb = _.isFunction(cb) ? cb : (err) => {
    if (err) {
      logger.log('debug', err);
    }
  };

  headers = _.merge({'PRIVATE-TOKEN': config.PRIVATE_TOKEN}, headers || {});

  const obj = {
    resolveWithFullResponse: true,
    simple: false,
    json: true,
    headers,
    uri: `${url}`
  };

  logger.log('info', `Calling out to ${obj.uri}`);
  const p = requestPromise(obj);
  p.then((resp) => {
    cb(null, resp);
  })
  .catch((err) => {
    cb(err);
  });
}


/**
 * getGroups - description
 *
 * @param  {type} url description
 * @param  {type} groups description
 * @param  {type} cb callback
 */
function getGroups(url, groups, cb) {
  if (_.isFunction(url)) { // CWD-- if we got just the cb then default the args
    cb = url;
    url = null;
    groups = null;
  }

  cb = _.isFunction(cb) ? cb : (err) => { // CWD-- make sure we've got a function for a cb
    if (err) {
      logger.log('debug', err);
    }
  };

  url = url || `${urlBase}/groups?per_page=${perPage}`; // CWD-- set the starting url if we're not iterating yet
  groups = groups || [];

  callOut(url, (err, resp) => {
    if (err) {
      logger.log('debug', err);
      return cb(err); // CWD-- bail out with an error
    }

    groups = _.concat(groups, resp.body);
    const link = LinkHeader.parse(_.get(resp.headers, 'link', ''));
    const aNext = link.get('rel', 'next');

    url = aNext.length > 0 ? aNext[0].uri : null;
    logger.log('debug', `next page: ${_.get(resp.headers, 'X-Next-Page', '')}`);

    if (url) {
      logger.log('info', 'calling for more groups');
      return getGroups(url, groups, cb);
    }

    logger.log('info', `returning ${groups.length} groups`);
    return cb(null, groups);
  });
}

inquirer.prompt([{
  type: 'list',
  name: 'execute',
  message: 'Execute Group cleanup?',
  default: 'yes',
  choices: ['yes', 'no']
}, {
  type: 'input',
  name: 'privateToken',
  message: 'Gitlab Token?',
  default: null,
  when: (answers) => {
    return (answers.execute === 'yes') && !config.PRIVATE_TOKEN;
  }
}]).then((startAnswer) => {
  if ((startAnswer.execute === 'yes') && startAnswer.privateToken) {
    config.PRIVATE_TOKEN = config.PRIVATE_TOKEN || startAnswer.privateToken;

    return getGroups((err, data) => {
      logger.log('debug', 'callback returned');
      if (err) {
        logger.log('debug', err);
      } else {
        console.log(data);
        _.forEach(data, (v, k) => {
          inquirer.prompt([{
            type: 'list',
            name: 'execute',
            message: `clean out '${v.name}'?`,
            default: 'yes',
            choices: ['yes', 'no']
          }]).then((groupAnswer) => {
            if (groupAnswer.execute === 'yes') {
              logger.log('debug', k, v);
            } else {
              logger.log('debug', `ok. skipping grou '${v.name}'`);
            }
          });
        });
      }
    });
  } else if ((startAnswer.execute === 'yes') && !startAnswer.privateToken) {
    logger.log('error', 'private token required for execution');
  }

  logger.log('info', 'kthxbai!');
  return null;
}).catch((err) => {
  logger.log('error', err);
});
