'use strict';

const _ = require('lodash');
const config = require('config');
const logger = require('winston');
const requestPromise = require('request-promise');
const LinkHeader = require('http-link-header');
const inquirer = require('inquirer');
const Rx = require('rx');

const ui = new inquirer.ui.BottomBar();

const version = 3;
const perPage = 40;
const urlBase = `https://gitlab.com/api/v${version}`;

const HTTP_200 = 200;
const ACCESS_GUEST = 10;
const ACCESS_REPORTER = 20;
const ACCESS_DEVELOPER = 30;
const ACCESS_MASTER = 40;
const ACCESS_OWNER = 50;

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
    headers: {'PRIVATE-TOKEN': config.PRIVATE_TOKEN},
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


function removeMember(groupId, memberId, cb) {
  const obj = {
    resolveWithFullResponse: true,
    simple: false,
    json: true,
    headers: {'PRIVATE-TOKEN': config.PRIVATE_TOKEN},
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

    return getGroups((getGroupsErr, groupData) => {
      logger.log('debug', 'callback returned');
      if (getGroupsErr) {
        logger.log('debug', getGroupsErr);
      } else {
        const observe = Rx.Observable.create((obs) => {
          _.forEach(groupData, (v, k) => {
            obs.onNext({
              type: 'list',
              name: `execute_${k}`,
              message: `${k}: clean out '${v.name}'?`,
              default: {name: 'no', value: null},
              choices: [{name: 'yes', value: v.id}, {name: 'no', value: null}],
              validate: (answer) => {
                return answer;
              }
            });
          });
          obs.onCompleted();
        });

        inquirer.prompt(observe).then((answers) => {
          _.forEach(answers, (groupId) => {
            if (groupId) {
              getMembersForGroup(groupId, (getMembersErr, members) => {
                console.log(getMembersErr, members);
                if (getMembersErr) {
                  logger.log('error', getMembersErr);
                } else {
                  logger.log('info', `removing members for group: ${groupId}`);
                  _.forEach(members, (member, iM) => {
                    if (_.includes(config.WHITELIST_MEMBER, member.username)) {
                      logger.log('info', `${member.username} is in white list. Skipping.`);
                    } else {
                      logger.log('info', `removing member: ${member.username} from group ${groupId}`);
                      removeMember(groupId, member.id, (removeMemberErr, data) => {
                        if (removeMemberErr) {
                          logger.log('error', removeMemberErr);
                        } else {
                          logger.log('info', `${member.username} removed from group ${groupId}`);
                        }
                      });
                    }
                  });
                }
              });
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
