#!/bin/bash

# Get the version of yorkie-js-sdk
read -p "Enter the yorkie-js-sdk version: " version

# Change the directory to the examples folder
cd examples

# Loop through all example folders
for dir in */; do
  # Check if it is a directory and exclude the dist folder
  echo $dir
  if [ -d "$dir" ] && [ "$dir" != "dist/" ]; then
    # Move to the example folder
    cd "$dir"
    
    # Execute npm i and npm run build
    npm i "yorkie-js-sdk@$version" && npm run build
    
    # Check the result of the execution
    if [ $? -ne 0 ]; then
      echo "Error occurred in $dir"
    else
      echo "$dir build succeeded"
    fi
    
    # Move back to the examples folder
    cd ..
  fi
done
