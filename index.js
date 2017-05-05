'use strict';

const _ = require('lodash');
const config = require('config');
const logger = require('winston');
const inquirer = require('inquirer');
const Rx = require('rx');
const Gitlab = require('./gitlabHelper');

logger.level = config.LOG_LEVEL;

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
    const gitlab = new Gitlab(config.PRIVATE_TOKEN, config.PER_PAGE);

    return gitlab.getGroups((getGroupsErr, groupData) => {
      logger.log('debug', 'callback returned');

      if (getGroupsErr) {
        logger.log('debug', getGroupsErr);
      } else {
        const observe = Rx.Observable.create((obs) => { // CWD-- add each group as a question
          _.forEach(groupData, (v, k) => {
            obs.onNext({
              type: 'list',
              name: `execute_${k}`,
              message: `${k}: clean out '${v.name}'?`,
              default: {name: 'no', value: null},
              choices: [{name: 'no', value: null}, {name: 'yes', value: v}],
              validate: (answer) => {
                return answer;
              }
            });
          });
          obs.onCompleted();
        });

        inquirer.prompt(observe).then((answers) => { // CWD-- prompt for each group
          const memberObservable = new Rx.Subject();
          memberObservable.subscribe((val) => { // CWD-- subscribe to pushes on member
            const member = val.member;
            const group = val.group;
            logger.log('info', `removing member: ${member.username} from group ${group.name}`);

            gitlab.removeMember(group.id, member.id, (removeMemberErr, data) => { // CWD-- execute removal
              if (removeMemberErr) {
                logger.log('info', `There was an issue while trying to remove ${member.username} from group '${group.name}'`);
                logger.log('error', removeMemberErr);
                // memberObservable.onNext({group, member});
              } else {
                logger.log('info', `${member.username} removed from group '${group.name}'`);
                logger.log('debug', data);
              }
            });
          });

          _.forEach(answers, (group) => { // CWD-- loop the answers
            if (group) { // CWD-- if value is an object
              gitlab.getMembersForGroup(group.id, (getMembersErr, members) => { // CWD-- grab all the members
                if (getMembersErr) {
                  logger.log('info', `An error occured while trying to get members for '${group.name}'`);
                  logger.log('error', getMembersErr);
                } else {
                  _.forEach(members, (member) => { // CWD-- loop the members
                    if (_.includes(config.WHITELIST_MEMBER, member.username)) { // CWD-- skip specific users
                      logger.log('info', `${member.username} is in white list. Skipping.`);
                    } else { // CWD-- add member for removal
                      logger.log('info', `marking ${member.username} for removal from group '${group.name}'`);
                      memberObservable.onNext({group, member}); // CWD-- put data onto Observable queue for processing
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
