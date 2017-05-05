'use strict';

const _ = require('lodash');
const logger = require('winston');
const requestPromise = require('request-promise');
const LinkHeader = require('http-link-header');

const version = 3;
const urlBase = `https://gitlab.com/api/v${version}`;

const HTTP_200 = 200;
// const ACCESS_GUEST = 10;
// const ACCESS_REPORTER = 20;
const ACCESS_DEVELOPER = 30;
// const ACCESS_MASTER = 40;
// const ACCESS_OWNER = 50;

let privateToken = '';
let perPage = 100;

/**
 * fetchData - description
 *
 * @param  {type} url description
 * @param  {type} payload description
 * @param  {type} cb  description
 */
function fetchData(url, payload, cb) {
  if (_.isFunction(payload)) {
    cb = payload;
    payload = [];
  }

  cb = _.isFunction(cb) ? cb : (err) => {
    if (err) {
      logger.log('debug', err);
    }
  };

  const obj = {
    resolveWithFullResponse: true,
    simple: false,
    json: true,
    headers: {'PRIVATE-TOKEN': privateToken},
    uri: `${url}`
  };

  logger.log('info', `Calling out to ${obj.uri}`);
  const p = requestPromise(obj);
  p.then((resp) => {
    if (resp.statusCode !== HTTP_200) {
      logger.log('error', resp.body);
      return cb(resp.body); // CWD-- bail out with an error
    }

    payload = _.concat(payload, resp.body);
    url = getNextURL(resp.headers);
    logger.log('debug', `next page: ${_.get(resp.headers, 'X-Next-Page', '')}`);

    if (url) {
      logger.log('info', 'calling for more payload');
      return fetchData(url, payload, cb);
    }

    logger.log('info', `returning ${payload.length} records`);
    return cb(null, payload);
  })
  .catch((err) => {
    cb(err);
  });
}


/**
 * getNextURL - description
 *
 * @param  {type} headers description
 * @returns {type}         description
 */
function getNextURL(headers) {
  const link = LinkHeader.parse(_.get(headers, 'link', ''));
  const aNext = link.get('rel', 'next');

  return aNext.length > 0 ? aNext[0].uri : null;
}


/**
 * removeMember - description
 *
 * @param  {type} groupId  description
 * @param  {type} memberId description
 * @param  {type} cb       description
 */
function removeMember(groupId, memberId, cb) {
  const obj = {
    resolveWithFullResponse: true,
    simple: false,
    json: true,
    headers: {'PRIVATE-TOKEN': privateToken},
    uri: `${urlBase}/groups/${groupId}/members/${memberId}`,
    method: 'DELETE'
  };

  const p = requestPromise(obj);
  p.then((resp) => {
    cb(null, resp.body);
  })
  .catch((err) => {
    cb(err);
  });
}

/**
 * getMembersForGroup - description
 *
 * @param  {type} groupId description
 * @param  {type} cb      description
 */
function getMembersForGroup(groupId, cb) {
  cb = _.isFunction(cb) ? cb : (err) => { // CWD-- make sure we've got a function for a cb
    if (err) {
      logger.log('debug', err);
    }
  };

  const url = `${urlBase}/groups/${groupId}/members?access_level=${ACCESS_DEVELOPER}&per_page=${perPage}`; // CWD-- set the starting url if we're not iterating yet

  fetchData(url, cb);
}

/**
 * getGroups - description
 *
 * @param  {type} cb callback
 */
function getGroups(cb) {
  cb = _.isFunction(cb) ? cb : (err) => { // CWD-- make sure we've got a function for a cb
    if (err) {
      logger.log('debug', err);
    }
  };

  const url = `${urlBase}/groups?per_page=${perPage}`; // CWD-- set the starting url if we're not iterating yet
  fetchData(url, cb);
}

module.exports = function Gitlab(pt, pp) {
  privateToken = pt;
  perPage = pp || perPage;

  return {
    getGroups,
    getMembersForGroup,
    removeMember
  };
};
