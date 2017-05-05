'use strict';

const config = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  PRIVATE_TOKEN: process.env.PRIVATE_TOKEN || null,
  WHITELIST_MEMBER: ['lazybaer', 'jmgasper', 'callmekatootie', 'aaabbott', 'tgerring', 'dmessing1', 'jwheeler', 'mlindenmuth', 'machenmusik', 'birdofpreyru'],
  WHITELIST_GROUP: [],
  PER_PAGE: 100
};

module.exports = config;
