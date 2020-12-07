#!/bin/bash
set -e
echo Testing
branch=$(git branch | sed -n -e 's/^\* \(.*\)/\1/p')
if [ "$branch" == "master" ]
then
    yarn test
fi