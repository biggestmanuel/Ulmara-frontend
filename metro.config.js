// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

config.resolver.extraNodeModules = {
  crypto: path.dirname(require.resolve('crypto-browserify/package.json')),
  stream: path.dirname(require.resolve('stream-browserify/package.json')),
  events: path.dirname(require.resolve('events/package.json')),
  buffer: path.dirname(require.resolve('buffer/package.json')),
  tronweb: require.resolve('tronweb/dist/TronWeb.js'),
};

module.exports = config;