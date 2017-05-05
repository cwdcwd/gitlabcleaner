# gitlabcleaner

## Description:
Gitlab member remover app to remove members with developer level access from a group. The app prompts you for your gitlab token and then iterates over all the groups you have access to, asking if you'd like to process that group. From there it runs over your selected groups and removes all members with Developer level access except those placed in your config file's "WHITELIST_MEMBER" array.

## Installation:
`npm i`

## Running:
`npm start`

## Testing:
uhhh about that...
