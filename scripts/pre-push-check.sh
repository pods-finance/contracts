#!/bin/bash
set -e
echo teste
branch=$(git branch | sed -n -e 's/^\* \(.*\)/\1/p')
if [ "$branch" == "master" ]
then
    npm test
fi