#!/bin/bash

# Update package lists
apt-get update

# Install Git
apt-get install -y git

# Verify Git installation
git --version

# Keep the function app running
exec "$@" 