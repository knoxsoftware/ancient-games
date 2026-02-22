#!/bin/bash
docker compose build; docker tag docker.io/library/games-app registry.digitalocean.com/prod2/games:v0.0.1;  docker push registry.digitalocean.com/prod2/games:v0.0.1\
sleep 2
kubectl rollout restart -n games deployment/ancient-games
