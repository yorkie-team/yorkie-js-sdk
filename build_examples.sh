#!/bin/bash

# 버전을 입력받기
read -p "Enter the yorkie-js-sdk version: " version

# examples 폴더로 이동
cd examples

# 모든 예제 폴더들에 대해 반복
for dir in */; do
  # 디렉토리인지 확인하고 dist 폴더는 제외
  if [ -d "$dir" ] && [ "$dir" != "dist/" ]; then
    # 예제 폴더로 이동
    cd "$dir"
    
    # npm i와 npm run build 실행
    npm i "yorkie-js-sdk@$version" && npm run build
    
    # 실행 결과 확인
    if [ $? -ne 0 ]; then
      echo "Error occurred in $dir"
    else
      echo "$dir build succeeded"
    fi
    
    # 원래 디렉토리로 돌아오기
    cd ..
  fi
done
